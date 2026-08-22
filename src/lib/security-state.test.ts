import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createPlaintextApiKey,
  hasApiScope,
  hashApiSecret,
  parsePlaintextApiKey,
  verifyApiSecret,
} from "./api-crypto.ts";
import { assertAdminRegistrationCode } from "./admin-registration.ts";
import { canTransitionDirectSell } from "./direct-sell-state.ts";
import { canTransitionP2pOrder, normalizeP2pMarketplaceAd } from "./p2p-state.ts";
import {
  calculateP2pSellerFee,
  calculatePercentFee,
  isP2pAutoReleaseEligible,
} from "./trade-fees.ts";
import {
  clearWithdrawalIdempotencyForTests,
  rememberWithdrawalIdempotency,
} from "./withdrawal-state.ts";
import {
  formatWebhookSignature,
  signWebhookBody,
  verifyWebhookSignature,
} from "./webhook-crypto.ts";
import {
  createSignedTelegramInitDataForTest,
  normalizeTelegramDeepLink,
  validateTelegramInitData,
} from "./telegram-auth.ts";
import { createMiniAppClientId, miniAppErrorHomeHref } from "./mini-app-runtime.ts";
import {
  createPersonalWalletMnemonic,
  deriveTronWalletFromMnemonic,
} from "./tron-personal-wallet.ts";
import { isTronAddress, parseTokenBalanceHex } from "./chain.ts";
import { decryptMnemonic, encryptMnemonic } from "./wallet-crypto.ts";
import {
  addressesAreSeparated,
  canAccessWalletSecret,
  filterWalletHistory,
  gasSponsorshipUsable,
  onChainSendEnabled,
  selectActiveWallet,
  userOwnsWallet,
  walletDisplayBalance,
} from "./wallet-state.ts";
import { chooseImportedWalletNetwork, decideImportedWalletNetwork } from "./wallet-network.ts";
import { collectPaginatedTronGridRows } from "./tron-pagination.ts";
import {
  canAccessKnownWalletHistory,
  filterMiniWalletTransactions,
  gasfreeCapabilityStatus,
  gasfreeUnavailableClaim,
  importedMnemonicWalletType,
  miniWalletBackScreen,
  miniWalletHistoryMerge,
  newestFirstMiniWalletTransactions,
  preserveWalletTypeForExplicitCreation,
  walletAssetBalances,
  walletBottomTab,
  walletHistoryNavigationTarget,
  walletTypeAndGasfreeCapabilityAreIndependent,
} from "./mini-wallet-ui.ts";
import {
  createMiniT,
  isMiniRtl,
  normalizeMiniLocale,
  technicalTextDirection,
} from "./mini-i18n.ts";
import {
  hashTransactionPassword,
  shouldLockTransactionPassword,
  verifyTransactionPasswordHash,
} from "./transaction-password.ts";
import {
  appendTelegramHandoff,
  canConsumeTelegramHandoff,
  createTelegramWebAppButton,
  isCredentialMessageStep,
  isTelegramAuthStateExpired,
  nextTelegramAuthStep,
  shouldLockTelegramAuth,
  telegramAuthEmailPrompt,
  telegramAuthPasswordPrompt,
  telegramAuthSuccessMessage,
} from "./telegram-bot-flow.ts";
import {
  canResumeListing,
  ensureReservedLiquidityPreserved,
  nextAccountStatus,
  reservationBlockedByAccount,
  validatePaymentIdentity,
  validateVendorAccountLimits,
} from "./vendor-policy.ts";
import { PERMISSIONS, grants } from "./rbac.ts";
import { safeErrorMessage } from "./system-health-policy.ts";
import {
  assertSendAmount,
  assertSigningSwitches,
  assertSufficientBalance,
  assertValidTronAddress,
  companyWalletCanSign,
  signerRequestSignature,
  verifySignerServiceRequest,
} from "./signer-policy.ts";

describe("API key crypto", () => {
  it("parses and verifies generated keys", () => {
    const key = createPlaintextApiKey();
    const parsed = parsePlaintextApiKey(key.plaintext);
    assert.ok(parsed);
    assert.equal(parsed.keyId, key.keyId);
    assert.ok(verifyApiSecret(parsed.secret, hashApiSecret(key.secret)));
    assert.equal(verifyApiSecret("wrong", hashApiSecret(key.secret)), false);
  });

  it("enforces scopes", () => {
    assert.equal(hasApiScope(["deposit:create"], "deposit:create"), true);
    assert.equal(hasApiScope(["deposit:read"], "deposit:create"), false);
    assert.equal(hasApiScope(["*"], "direct_sell:create"), true);
  });
});

describe("webhook signatures", () => {
  it("signs and verifies payloads", () => {
    const body = JSON.stringify({ event_id: "evt_1", data: { ok: true } });
    const timestamp = "1786819200";
    const signature = formatWebhookSignature(signWebhookBody("secret", timestamp, body));
    assert.equal(verifyWebhookSignature("secret", timestamp, body, signature), true);
    assert.equal(verifyWebhookSignature("secret", timestamp, `${body} `, signature), false);
  });
});

describe("P2P state machine", () => {
  it("allows legal transitions and rejects double release/completion", () => {
    assert.equal(canTransitionP2pOrder("payment_pending", "payment_submitted"), true);
    assert.equal(canTransitionP2pOrder("payment_submitted", "payment_received"), true);
    assert.equal(canTransitionP2pOrder("completed", "completed"), false);
    assert.equal(canTransitionP2pOrder("completed", "refunded"), false);
  });

  it("normalizes marketplace rows without relying on embedded merchant shape", () => {
    const ad = normalizeP2pMarketplaceAd({
      id: "ad-1",
      side: "sell",
      price_inr: "103.20",
      available_usdt: "1000",
      min_order_inr: "500",
      max_order_inr: "50000",
      payment_methods: null,
    });
    assert.equal(ad.asset, "USDT");
    assert.equal(ad.fiat, "INR");
    assert.equal(ad.price_inr, 103.2);
    assert.deepEqual(ad.payment_methods, ["upi"]);
  });

  it("calculates configurable seller and vendor fees", () => {
    assert.equal(
      calculateP2pSellerFee(100, {
        sellerFixedUsdt: 1.5,
        sellerPercent: 0.5,
        buyerPercent: 0,
        minFeeUsdt: 0,
        maxFeeUsdt: 0,
      }),
      2,
    );
    assert.equal(
      calculateP2pSellerFee(1000, {
        sellerFixedUsdt: 1.5,
        sellerPercent: 1,
        buyerPercent: 0,
        minFeeUsdt: 0,
        maxFeeUsdt: 5,
      }),
      5,
    );
    assert.equal(calculatePercentFee(100, 0.5), 0.5);
  });

  it("requires proof, UTR, deadline and no dispute for auto-release", () => {
    const now = new Date("2026-08-16T10:00:00.000Z");
    assert.equal(
      isP2pAutoReleaseEligible({
        status: "payment_submitted",
        deadline: new Date("2026-08-16T09:59:00.000Z"),
        now,
        hasUtr: true,
        hasPaidAmount: true,
        hasProof: true,
        disputed: false,
        escrowLocked: true,
        escrowSettled: false,
      }),
      true,
    );
    assert.equal(
      isP2pAutoReleaseEligible({
        status: "payment_submitted",
        deadline: new Date("2026-08-16T09:59:00.000Z"),
        now,
        hasUtr: true,
        hasPaidAmount: true,
        hasProof: true,
        disputed: true,
        escrowLocked: true,
        escrowSettled: false,
      }),
      false,
    );
  });
});

describe("direct sell state machine", () => {
  it("separates blockchain confirmation from payment settlement", () => {
    assert.equal(canTransitionDirectSell("usdt_confirmed", "inr_payment_pending"), true);
    assert.equal(canTransitionDirectSell("usdt_confirmed", "completed"), false);
    assert.equal(canTransitionDirectSell("inr_payment_sent", "completed"), true);
  });
});

describe("withdrawal idempotency helper", () => {
  it("rejects duplicate user keys", () => {
    clearWithdrawalIdempotencyForTests();
    assert.equal(rememberWithdrawalIdempotency("user-a", "key-1"), true);
    assert.equal(rememberWithdrawalIdempotency("user-a", "key-1"), false);
    assert.equal(rememberWithdrawalIdempotency("user-b", "key-1"), true);
  });
});

describe("personal TRON wallet recovery", () => {
  it("derives the same TRON address from the same recovery phrase", () => {
    const mnemonic = createPersonalWalletMnemonic();
    const first = deriveTronWalletFromMnemonic(mnemonic);
    const second = deriveTronWalletFromMnemonic(mnemonic);
    assert.equal(first.address, second.address);
    assert.match(first.address, /^T[1-9A-HJ-NP-Za-km-z]{33}$/);
  });

  it("derives different addresses from different recovery phrases", () => {
    const first = deriveTronWalletFromMnemonic(createPersonalWalletMnemonic());
    const second = deriveTronWalletFromMnemonic(createPersonalWalletMnemonic());
    assert.notEqual(first.address, second.address);
  });

  it("imports the same recovery phrase to the same TRON address", () => {
    const mnemonic = createPersonalWalletMnemonic();
    const created = deriveTronWalletFromMnemonic(mnemonic);
    const imported = deriveTronWalletFromMnemonic(mnemonic);
    assert.equal(imported.address, created.address);
    assert.equal(isTronAddress(imported.address), true);
  });

  it("encrypts and decrypts recovery phrases with the transaction password", () => {
    const mnemonic = createPersonalWalletMnemonic();
    const encrypted = encryptMnemonic(mnemonic, "wallet-password-1");
    assert.notEqual(encrypted.encryptedMnemonic, mnemonic);
    assert.equal(decryptMnemonic({ ...encrypted, password: "wallet-password-1" }), mnemonic);
    assert.throws(
      () => decryptMnemonic({ ...encrypted, password: "wrong-password" }),
      /Unsupported state|authenticate/i,
    );
  });
});

describe("wallet ownership and selected-wallet state", () => {
  const wallets = [
    {
      id: "wallet-a",
      user_id: "user-a",
      address: "TA111111111111111111111111111111111",
      balance: 5,
      onchain_balance: 42,
      custody: "non_custodial",
      is_default: false,
    },
    {
      id: "wallet-b",
      user_id: "user-a",
      address: "TB111111111111111111111111111111111",
      balance: 8,
      onchain_balance: 1,
      custody: "custodial",
      is_default: true,
    },
  ];
  const firstWallet = wallets[0]!;
  const secondWallet = wallets[1]!;

  it("uses selected/default wallet and denies cross-user secret access", () => {
    assert.equal(selectActiveWallet(wallets, "wallet-a")?.id, "wallet-a");
    assert.equal(selectActiveWallet(wallets)?.id, "wallet-b");
    assert.equal(userOwnsWallet(firstWallet, "user-a"), true);
    assert.equal(userOwnsWallet(firstWallet, "user-b"), false);
    assert.equal(canAccessWalletSecret(firstWallet, "user-a"), true);
    assert.equal(canAccessWalletSecret(firstWallet, "user-b"), false);
  });

  it("filters history to the selected wallet only", () => {
    const rows = [
      { id: "tx-a", wallet_id: "wallet-a" },
      { id: "tx-b", wallet_id: "wallet-b" },
      { id: "tx-c", wallet_id: "wallet-a" },
    ];
    assert.deepEqual(
      filterWalletHistory(rows, "wallet-a").map((row) => row.id),
      ["tx-a", "tx-c"],
    );
  });

  it("keeps personal receive and platform deposit addresses separated", () => {
    assert.equal(
      addressesAreSeparated(firstWallet.address, "TC111111111111111111111111111111111"),
      true,
    );
    assert.equal(addressesAreSeparated(firstWallet.address, firstWallet.address), false);
  });

  it("uses on-chain balance for non-custodial wallets and blocks fake sends", () => {
    assert.equal(walletDisplayBalance(firstWallet), 42);
    assert.equal(walletDisplayBalance(secondWallet), 8);
    assert.equal(onChainSendEnabled(firstWallet), true);
    assert.equal(onChainSendEnabled(secondWallet), true);
  });

  it("models GasFree as unavailable unless sponsorship is configured", () => {
    assert.equal(gasSponsorshipUsable("unavailable"), false);
    assert.equal(gasSponsorshipUsable("available"), true);
    assert.equal(gasSponsorshipUsable("limited"), true);
  });

  it("parses TRC20 constant-call USDT balances", () => {
    assert.equal(
      parseTokenBalanceHex("0000000000000000000000000000000000000000000000000000000005f5e100", 6),
      100,
    );
  });
});

describe("server-side signer safety", () => {
  it("validates TRON Base58Check addresses", () => {
    assert.doesNotThrow(() => assertValidTronAddress("TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7"));
    assert.throws(() => assertValidTronAddress("TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU8"), /valid/);
    assert.equal(isTronAddress("TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU8"), true);
  });

  it("handles USDT and TRX amount precision", () => {
    assert.doesNotThrow(() => assertSendAmount("USDT", 1.123456));
    assert.doesNotThrow(() => assertSendAmount("TRX", 0.000001));
    assert.throws(() => assertSendAmount("USDT", 1.1234567), /decimal/);
    assert.throws(() => assertSendAmount("TRX", 0), /greater than zero/);
  });

  it("enforces send kill switch and mainnet guard", () => {
    assert.throws(
      () =>
        assertSigningSwitches({
          dbEnabled: false,
          envEnabled: "true",
          network: "trc20-nile",
        }),
      /ON_CHAIN_SEND_DISABLED/,
    );
    assert.throws(
      () =>
        assertSigningSwitches({
          dbEnabled: true,
          envEnabled: "true",
          network: "trc20-mainnet",
          mainnetEnabled: "false",
        }),
      /MAINNET_SIGNING_DISABLED/,
    );
    assert.doesNotThrow(() =>
      assertSigningSwitches({
        dbEnabled: true,
        envEnabled: "true",
        network: "trc20-nile",
      }),
    );
  });

  it("rejects insufficient balances and network resources", () => {
    assert.throws(
      () =>
        assertSufficientBalance({
          asset: "USDT",
          amount: 50,
          usdtBalance: 10,
          trxBalance: 100,
          estimatedTrxRequired: 30,
        }),
      /INSUFFICIENT_USDT/,
    );
    assert.throws(
      () =>
        assertSufficientBalance({
          asset: "USDT",
          amount: 10,
          usdtBalance: 10,
          trxBalance: 1,
          estimatedTrxRequired: 30,
        }),
      /INSUFFICIENT_NETWORK_RESOURCES/,
    );
    assert.throws(
      () =>
        assertSufficientBalance({
          asset: "TRX",
          amount: 10,
          usdtBalance: 0,
          trxBalance: 10,
          estimatedTrxRequired: 0.1,
        }),
      /INSUFFICIENT_TRX/,
    );
  });

  it("protects watch-only company wallets from signing", () => {
    assert.equal(companyWalletCanSign("WATCH_ONLY"), false);
    assert.equal(companyWalletCanSign("SIGNING_ENABLED"), true);
    assert.equal(companyWalletCanSign(null), false);
  });

  it("authenticates signer service requests and rejects replay", () => {
    const body = JSON.stringify({ requestId: "req_1" });
    const timestamp = "1786819200000";
    const nonce = "nonce-1";
    const secret = "test-signer-secret";
    const signature = signerRequestSignature({ body, timestamp, nonce, secret });
    assert.equal(
      verifySignerServiceRequest({
        body,
        timestamp,
        nonce,
        secret,
        signature,
        nowMs: 1786819200000,
      }),
      true,
    );
    assert.throws(
      () =>
        verifySignerServiceRequest({
          body,
          timestamp,
          nonce,
          secret,
          signature,
          nowMs: 1786819200000,
          seenNonce: true,
        }),
      /REPLAY/,
    );
  });
});

describe("imported wallet network detection", () => {
  it("selects Mainnet when only Mainnet has balance or activity", () => {
    assert.equal(
      chooseImportedWalletNetwork("trc20-nile", [
        { network: "trc20-mainnet", trxBalance: 7.954209, usdtBalance: 15, txCount: 4 },
        { network: "trc20-nile", trxBalance: 0, usdtBalance: 0, txCount: 0 },
      ]),
      "trc20-mainnet",
    );
  });

  it("selects Nile when only Nile has balance or activity", () => {
    assert.equal(
      chooseImportedWalletNetwork("trc20-mainnet", [
        { network: "trc20-mainnet", trxBalance: 0, usdtBalance: 0, txCount: 0 },
        { network: "trc20-nile", trxBalance: 5, usdtBalance: 10, txCount: 2 },
      ]),
      "trc20-nile",
    );
  });

  it("requires user selection when both networks have activity", () => {
    assert.deepEqual(
      decideImportedWalletNetwork(
        "trc20-nile",
        [
          { network: "trc20-mainnet", trxBalance: 7.954209, usdtBalance: 15, txCount: 4 },
          { network: "trc20-nile", trxBalance: 1, usdtBalance: 0, txCount: 1 },
        ],
        false,
      ),
      {
        type: "requires_selection",
        reason: "multiple_active",
        probes: [
          { network: "trc20-mainnet", trxBalance: 7.954209, usdtBalance: 15, txCount: 4 },
          { network: "trc20-nile", trxBalance: 1, usdtBalance: 0, txCount: 1 },
        ],
      },
    );
  });

  it("requires user selection when no supported network has activity", () => {
    const decision = decideImportedWalletNetwork(
      "trc20-nile",
      [
        { network: "trc20-mainnet", trxBalance: 0, usdtBalance: 0, txCount: 0 },
        { network: "trc20-nile", trxBalance: 0, usdtBalance: 0, txCount: 0 },
      ],
      false,
    );
    assert.equal(decision.type, "requires_selection");
    if (decision.type === "requires_selection") assert.equal(decision.reason, "no_activity");
  });

  it("persists an explicitly confirmed imported wallet network", () => {
    assert.deepEqual(
      decideImportedWalletNetwork(
        "trc20-mainnet",
        [
          { network: "trc20-mainnet", trxBalance: 0, usdtBalance: 0, txCount: 0 },
          { network: "trc20-nile", trxBalance: 0, usdtBalance: 0, txCount: 0 },
        ],
        true,
      ),
      { type: "selected", network: "trc20-mainnet", reason: "confirmed" },
    );
  });

  it("refresh and history use the persisted wallet network", () => {
    const wallet = { network: "trc20-mainnet" as const };
    assert.equal(
      chooseImportedWalletNetwork(wallet.network, [
        { network: "trc20-mainnet", trxBalance: 1, usdtBalance: 0, txCount: 1 },
        { network: "trc20-nile", trxBalance: 0, usdtBalance: 0, txCount: 0 },
      ]),
      wallet.network,
    );
  });
});

describe("historical wallet history sync helpers", () => {
  it("paginates TronGrid history and stops on exhausted cursors", async () => {
    const pages = new Map([
      [
        undefined,
        {
          rows: [
            { id: "mainnet-trx-in-1", network: "trc20-mainnet", timestamp: 300 },
            { id: "mainnet-trx-in-2", network: "trc20-mainnet", timestamp: 200 },
          ],
          fingerprint: "next-page",
        },
      ],
      [
        "next-page",
        {
          rows: [{ id: "mainnet-trx-in-3", network: "trc20-mainnet", timestamp: 100 }],
          fingerprint: undefined,
        },
      ],
    ]);

    const rows = await collectPaginatedTronGridRows(
      async (fingerprint) => pages.get(fingerprint)!,
      (row) => row.id,
      { maxPages: 10 },
    );

    assert.deepEqual(
      rows.map((row) => row.id),
      ["mainnet-trx-in-1", "mainnet-trx-in-2", "mainnet-trx-in-3"],
    );
  });

  it("prevents duplicate rows across repeated paginated responses", async () => {
    const rows = await collectPaginatedTronGridRows(
      async (fingerprint) =>
        fingerprint
          ? { rows: [{ id: "same-txid" }, { id: "second-txid" }], fingerprint: undefined }
          : { rows: [{ id: "same-txid" }], fingerprint: "repeat" },
      (row) => row.id,
      { maxPages: 5 },
    );

    assert.deepEqual(
      rows.map((row) => row.id),
      ["same-txid", "second-txid"],
    );
  });

  it("prevents infinite pagination when TronGrid repeats a fingerprint", async () => {
    let calls = 0;
    const rows = await collectPaginatedTronGridRows(
      async () => {
        calls += 1;
        return { rows: [{ id: `tx-${calls}` }], fingerprint: "same-cursor" };
      },
      (row) => row.id,
      { maxPages: 10 },
    );

    assert.equal(calls, 2);
    assert.deepEqual(
      rows.map((row) => row.id),
      ["tx-1", "tx-2"],
    );
  });

  it("keeps Mainnet and Nile history isolated by network", () => {
    const rows = [
      { txid: "a", currency: "TRX", direction: "in", network: "trc20-mainnet" },
      { txid: "a", currency: "TRX", direction: "in", network: "trc20-nile" },
    ];
    const keys = new Set(
      rows.map((row) => `${row.network}:${row.txid}:${row.currency}:${row.direction}`),
    );
    assert.equal(keys.size, 2);
  });

  it("allows a wallet imported today to show transactions from before import", () => {
    const importedAt = Date.parse("2026-08-22T00:00:00Z");
    const historical = [
      { txid: "old-usdt", blockTimestamp: Date.parse("2026-02-27T12:50:15Z") },
      { txid: "old-trx", blockTimestamp: Date.parse("2026-05-24T11:11:39Z") },
    ];
    assert.equal(
      historical.every((row) => row.blockTimestamp < importedAt),
      true,
    );
  });

  it("orders wallet transactions newest first", () => {
    const rows = [
      { txid: "old", created_at: "2026-02-27T12:50:15Z" },
      { txid: "new", created_at: "2026-08-11T06:53:03Z" },
      { txid: "middle", created_at: "2026-05-24T11:11:39Z" },
    ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

    assert.deepEqual(
      rows.map((row) => row.txid),
      ["new", "middle", "old"],
    );
  });
});

describe("Mini App wallet UX routing and classification", () => {
  const rows = [
    {
      id: "w1-usdt-in",
      wallet_id: "wallet-1",
      currency: "USDT",
      direction: "in",
      created_at: "2026-08-11T06:53:03Z",
    },
    {
      id: "w1-trx-out",
      wallet_id: "wallet-1",
      currency: "TRX",
      direction: "out",
      created_at: "2026-05-24T11:11:39Z",
    },
    {
      id: "w2-usdt-in",
      wallet_id: "wallet-2",
      currency: "USDT",
      direction: "in",
      created_at: "2026-08-12T06:53:03Z",
    },
  ];

  it("routes wallet History to wallet history, not generic trade history", () => {
    assert.equal(walletHistoryNavigationTarget(), "wallet-history");
    assert.notEqual(walletHistoryNavigationTarget(), "history");
    assert.notEqual(walletBottomTab(walletHistoryNavigationTarget()), "trade");
  });

  it("keeps wallet history wallet-specific and can page all 76 known rows", () => {
    assert.deepEqual(
      filterMiniWalletTransactions(rows, "wallet-1", "ALL", "ALL").map((row) => row.id),
      ["w1-usdt-in", "w1-trx-out"],
    );
    assert.equal(canAccessKnownWalletHistory(76, 50), true);
  });

  it("filters asset detail rows by USDT and TRX", () => {
    assert.deepEqual(
      filterMiniWalletTransactions(rows, "wallet-1", "USDT", "ALL").map((row) => row.id),
      ["w1-usdt-in"],
    );
    assert.deepEqual(
      filterMiniWalletTransactions(rows, "wallet-1", "TRX", "ALL").map((row) => row.id),
      ["w1-trx-out"],
    );
  });

  it("filters received and sent directions", () => {
    assert.deepEqual(
      filterMiniWalletTransactions(rows, "wallet-1", "ALL", "in").map((row) => row.id),
      ["w1-usdt-in"],
    );
    assert.deepEqual(
      filterMiniWalletTransactions(rows, "wallet-1", "ALL", "out").map((row) => row.id),
      ["w1-trx-out"],
    );
  });

  it("normal external imports are always Standard, regardless of Mainnet or Nile", () => {
    assert.equal(importedMnemonicWalletType(), "standard");
    assert.equal(importedMnemonicWalletType(), "standard");
  });

  it("does not infer GasFree from network or token balance", () => {
    assert.equal(importedMnemonicWalletType(), "standard");
    assert.notEqual(importedMnemonicWalletType(), "gasfree");
  });

  it("preserves explicit GasFree wallet creation", () => {
    assert.equal(preserveWalletTypeForExplicitCreation("gasfree"), "gasfree");
    assert.equal(preserveWalletTypeForExplicitCreation("standard"), "standard");
  });

  it("keeps imported wallets Standard while showing GasFree capability independently", () => {
    assert.equal(importedMnemonicWalletType(), "standard");
    assert.equal(gasfreeCapabilityStatus("unavailable"), "unavailable");
    assert.equal(walletTypeAndGasfreeCapabilityAreIndependent("standard", "unavailable"), true);
    assert.equal(walletTypeAndGasfreeCapabilityAreIndependent("standard", "available"), true);
  });

  it("does not create a duplicate wallet or claim sponsorship when GasFree is unavailable", () => {
    const existingWalletIds = new Set(["wallet-1"]);
    existingWalletIds.add("wallet-1");
    assert.equal(existingWalletIds.size, 1);
    assert.match(gasfreeUnavailableClaim("unavailable"), /unavailable/);
  });

  it("shows selected wallet asset balances separately", () => {
    assert.deepEqual(walletAssetBalances(15, 7.954209), { USDT: 15, TRX: 7.954209 });
  });

  it("switching wallets changes selected-wallet history source", () => {
    assert.deepEqual(
      filterMiniWalletTransactions(rows, "wallet-2", "ALL", "ALL").map((row) => row.id),
      ["w2-usdt-in"],
    );
  });

  it("uses duplicate-safe history merge for load more", () => {
    assert.deepEqual(
      miniWalletHistoryMerge([rows[0]!, rows[1]!], [rows[1]!, rows[2]!]).map((row) => row.id),
      ["w1-usdt-in", "w1-trx-out", "w2-usdt-in"],
    );
  });

  it("keeps transaction ordering newest first", () => {
    assert.deepEqual(
      newestFirstMiniWalletTransactions([rows[1]!, rows[0]!]).map((row) => row.id),
      ["w1-usdt-in", "w1-trx-out"],
    );
  });

  it("keeps wallet back hierarchy under wallet screens", () => {
    assert.equal(miniWalletBackScreen("wallet-history"), "wallet-detail");
    assert.equal(miniWalletBackScreen("wallet-asset-detail"), "wallet-detail");
    assert.equal(miniWalletBackScreen("wallet-more"), "wallet-detail");
    assert.equal(miniWalletBackScreen("wallet-gasfree"), "wallet-detail");
    assert.equal(
      miniWalletBackScreen("wallet-transaction-detail", "wallet-history"),
      "wallet-history",
    );
    assert.equal(walletBottomTab("wallet-transaction-detail"), "wallet");
  });

  it("renders wallet strings in English, Chinese, Russian and Persian", () => {
    assert.equal(createMiniT("en")("portfolioBalance"), "Portfolio Balance");
    assert.equal(createMiniT("zh")("portfolioBalance"), "资产余额");
    assert.equal(createMiniT("ru")("portfolioBalance"), "Баланс портфеля");
    assert.equal(createMiniT("fa")("portfolioBalance"), "موجودی پورتفو");
  });

  it("uses RTL only for Persian while keeping blockchain technical values LTR", () => {
    assert.equal(isMiniRtl("fa"), true);
    assert.equal(isMiniRtl("en"), false);
    assert.equal(technicalTextDirection(), "ltr");
  });

  it("normalizes Telegram/browser locale values to supported Mini App languages", () => {
    assert.equal(normalizeMiniLocale("zh-CN"), "zh");
    assert.equal(normalizeMiniLocale("ru-RU"), "ru");
    assert.equal(normalizeMiniLocale("fa-IR"), "fa");
    assert.equal(normalizeMiniLocale("de-DE"), "en");
  });

  it("language switching preserves wallet identity, history state, network and type", () => {
    const walletState = {
      selectedWalletId: "wallet-1",
      historyIds: filterMiniWalletTransactions(rows, "wallet-1", "ALL", "ALL").map((row) => row.id),
      network: "trc20-mainnet",
      walletType: importedMnemonicWalletType(),
    };
    const switchedLocale = normalizeMiniLocale("fa");
    assert.equal(switchedLocale, "fa");
    assert.deepEqual(walletState.historyIds, ["w1-usdt-in", "w1-trx-out"]);
    assert.equal(walletState.selectedWalletId, "wallet-1");
    assert.equal(walletState.network, "trc20-mainnet");
    assert.equal(walletState.walletType, "standard");
  });

  it("language switching does not alter wallet classification or network values", () => {
    assert.equal(createMiniT("fa")("wallet"), "کیف پول");
    assert.equal(importedMnemonicWalletType(), "standard");
    assert.equal(preserveWalletTypeForExplicitCreation("gasfree"), "gasfree");
    assert.equal("trc20-mainnet", "trc20-mainnet");
  });
});

describe("transaction password primitives", () => {
  it("accepts the correct password and rejects the wrong password", () => {
    const hashed = hashTransactionPassword("correct horse battery staple");
    assert.equal(
      verifyTransactionPasswordHash(
        "correct horse battery staple",
        hashed.salt,
        hashed.passwordHash,
      ),
      true,
    );
    assert.equal(verifyTransactionPasswordHash("wrong", hashed.salt, hashed.passwordHash), false);
  });

  it("locks after repeated failed attempts", () => {
    assert.equal(shouldLockTransactionPassword(4), false);
    assert.equal(shouldLockTransactionPassword(5), true);
  });
});

describe("vendor account and listing controls", () => {
  it("validates account limits and payment identifiers", () => {
    assert.doesNotThrow(() =>
      validateVendorAccountLimits({ minInr: 100, maxInr: 1000, dailyLimitInr: 5000 }),
    );
    assert.throws(
      () => validateVendorAccountLimits({ minInr: 1000, maxInr: 100, dailyLimitInr: 5000 }),
      /Maximum INR/,
    );
    assert.doesNotThrow(() =>
      validatePaymentIdentity({ rail: "upi", accountRef: "vendor.pay@upi" }),
    );
    assert.throws(() => validatePaymentIdentity({ rail: "upi", accountRef: "not-upi" }), /UPI/);
    assert.doesNotThrow(() =>
      validatePaymentIdentity({ rail: "imps", accountRef: "1234567890", ifsc: "HDFC0001234" }),
    );
  });

  it("blocks new reservations on frozen or disabled accounts", () => {
    assert.equal(nextAccountStatus({ enabled: true, frozen: false }), "active");
    assert.equal(nextAccountStatus({ enabled: true, frozen: true }), "frozen");
    assert.equal(
      reservationBlockedByAccount({
        status: "frozen",
        enabled: true,
        frozen: true,
        archived: false,
      }),
      true,
    );
    assert.equal(
      reservationBlockedByAccount({
        status: "active",
        enabled: true,
        frozen: false,
        archived: false,
      }),
      false,
    );
  });

  it("preserves reserved liquidity and resumes only active liquid listings", () => {
    assert.doesNotThrow(() =>
      ensureReservedLiquidityPreserved({ requestedTotal: 1000, reserved: 300 }),
    );
    assert.throws(
      () => ensureReservedLiquidityPreserved({ requestedTotal: 299, reserved: 300 }),
      /Reserved liquidity/,
    );
    assert.equal(
      canResumeListing({
        availableUsdt: 700,
        accountStatus: "active",
        accountEnabled: true,
        accountFrozen: false,
        accountArchived: false,
      }),
      true,
    );
    assert.equal(
      canResumeListing({
        availableUsdt: 0,
        accountStatus: "active",
        accountEnabled: true,
        accountFrozen: false,
        accountArchived: false,
      }),
      false,
    );
  });
});

describe("RBAC and system error safety", () => {
  it("grants super admin implicitly and denies employees without explicit permission", () => {
    assert.equal(grants("super_admin", [], PERMISSIONS.EMPLOYEES_MANAGE), true);
    assert.equal(grants("employee", [], PERMISSIONS.EMPLOYEES_MANAGE), false);
    assert.equal(
      grants("employee", [PERMISSIONS.EMPLOYEES_MANAGE], PERMISSIONS.EMPLOYEES_MANAGE),
      true,
    );
  });

  it("redacts secrets before writing system errors", () => {
    const message = safeErrorMessage(
      "TRONGRID_API_KEY=secret-value private_key=abc123 mnemonic=seed words token=abc.def.ghi",
    );
    assert.equal(message.includes("secret-value"), false);
    assert.equal(message.includes("seed"), false);
    assert.match(message, /\[redacted\]/);
  });
});

describe("admin registration hardening", () => {
  it("is disabled when ADMIN_REGISTRATION_CODE is absent", async () => {
    assert.throws(
      () => assertAdminRegistrationCode(undefined, undefined),
      /self-registration is disabled/,
    );
  });

  it("requires the server-side administrator code for elevated registration", () => {
    assert.throws(() => assertAdminRegistrationCode(undefined, "server-only"), /Invalid/);
    assert.throws(() => assertAdminRegistrationCode("wrong", "server-only"), /Invalid/);
    assert.doesNotThrow(() => assertAdminRegistrationCode("server-only", "server-only"));
  });
});

describe("Telegram initData security", () => {
  const botToken = "123456:test-token";
  const now = 1_786_819_200;

  it("accepts valid signed Telegram initData", () => {
    const initData = createSignedTelegramInitDataForTest({
      botToken,
      authDate: now,
      user: { id: 987654321, first_name: "Test", username: "tester" },
      startParam: "wallet",
    });
    const verified = validateTelegramInitData(initData, botToken, { nowSeconds: now });
    assert.equal(verified.telegramUser.id, 987654321);
    assert.equal(verified.telegramUser.username, "tester");
    assert.equal(verified.startParam, "wallet");
  });

  it("rejects invalid signatures", () => {
    const initData = createSignedTelegramInitDataForTest({
      botToken,
      authDate: now,
      user: { id: 123, first_name: "Bad" },
    }).replace("Bad", "Tampered");
    assert.throws(
      () => validateTelegramInitData(initData, botToken, { nowSeconds: now }),
      /signature is invalid/,
    );
  });

  it("rejects expired initData", () => {
    const initData = createSignedTelegramInitDataForTest({
      botToken,
      authDate: now - 900,
      user: { id: 123, first_name: "Old" },
    });
    assert.throws(
      () => validateTelegramInitData(initData, botToken, { nowSeconds: now, maxAgeSeconds: 600 }),
      /expired/,
    );
  });

  it("normalizes deep links safely", () => {
    assert.equal(normalizeTelegramDeepLink("wallet"), "/wallet");
    assert.equal(normalizeTelegramDeepLink("mini-app/orders"), "/mini-app/orders");
    assert.equal(normalizeTelegramDeepLink("//evil.example"), "/mini-app");
    assert.equal(normalizeTelegramDeepLink("../admin"), "/mini-app");
  });
});

describe("Telegram bot auth flow", () => {
  it("uses distinct WTRON wording for login and registration", () => {
    assert.equal(telegramAuthEmailPrompt("login"), "Enter your registered email address.");
    assert.equal(
      telegramAuthEmailPrompt("register"),
      "Enter the email address you want to use for your WTRON account.",
    );
    assert.equal(telegramAuthPasswordPrompt("login"), "Enter your password.");
    assert.equal(telegramAuthPasswordPrompt("register"), "Create your password");
    assert.equal(telegramAuthSuccessMessage("login"), "Login successful.");
    assert.equal(
      telegramAuthSuccessMessage("register"),
      "Registration successful. Your WTRON account is ready.",
    );
  });

  it("advances login and registration steps without storing confirmation in DB", () => {
    assert.equal(nextTelegramAuthStep("login", "email"), "password");
    assert.equal(nextTelegramAuthStep("login", "password"), null);
    assert.equal(nextTelegramAuthStep("register", "password"), "confirm_password");
    assert.equal(isCredentialMessageStep("confirm_password"), true);
  });

  it("expires temporary auth state quickly", () => {
    assert.equal(isTelegramAuthStateExpired(new Date(1_000).toISOString(), 2_000), true);
    assert.equal(isTelegramAuthStateExpired(new Date(3_000).toISOString(), 2_000), false);
    assert.equal(isTelegramAuthStateExpired("not-a-date", 2_000), true);
  });

  it("locks after the configured failed-attempt threshold", () => {
    assert.equal(shouldLockTelegramAuth(4, 5), false);
    assert.equal(shouldLockTelegramAuth(5, 5), true);
  });

  it("requires one-time Mini App handoff tokens to be pending, bound and fresh", () => {
    const expiresAt = new Date(10_000).toISOString();
    assert.equal(
      canConsumeTelegramHandoff(
        { status: "pending", expiresAt, telegramUserId: 123, userId: "user-a" },
        123,
        "user-a",
        9_000,
      ),
      true,
    );
    assert.equal(
      canConsumeTelegramHandoff(
        { status: "used", expiresAt, telegramUserId: 123, userId: "user-a" },
        123,
        "user-a",
        9_000,
      ),
      false,
    );
    assert.equal(
      canConsumeTelegramHandoff(
        { status: "pending", expiresAt, telegramUserId: 123, userId: "user-a" },
        999,
        "user-a",
        9_000,
      ),
      false,
    );
    assert.equal(
      canConsumeTelegramHandoff(
        { status: "pending", expiresAt, telegramUserId: 123, userId: "user-a" },
        123,
        "user-a",
        11_000,
      ),
      false,
    );
  });

  it("builds Telegram Web App buttons and preserves handoff query parameters", () => {
    const path = appendTelegramHandoff("/mini-app?tab=wallet", "opaque-token");
    assert.equal(path, "/mini-app?tab=wallet&handoff=opaque-token");
    const button = createTelegramWebAppButton("OPEN MINI APP", `https://example.test${path}`);
    assert.equal(button.text, "OPEN MINI APP");
    assert.equal(
      button.web_app.url,
      "https://example.test/mini-app?tab=wallet&handoff=opaque-token",
    );
    assert.equal("url" in button, false);
  });
});

describe("Telegram Mini App runtime safety", () => {
  it("keeps root error recovery inside the Mini App", () => {
    assert.equal(miniAppErrorHomeHref("/mini-app"), "/mini-app?tab=home&auth=login");
    assert.equal(miniAppErrorHomeHref("/mini-app?tab=wallet"), "/mini-app?tab=home&auth=login");
    assert.equal(miniAppErrorHomeHref("/dashboard"), "/");
  });

  it("does not require crypto.randomUUID for Mini App client ids", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { getRandomValues: undefined, randomUUID: undefined },
    });
    try {
      const id = createMiniAppClientId("telegram-mini");
      assert.match(id, /^telegram-mini-/);
      assert.ok(id.length > "telegram-mini-".length);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
    }
  });
});
