import { tronAddressToHex } from "./tron-address.ts";

export type TronPermissionKey = {
  address?: string;
  weight?: number;
};

export type TronPermission = {
  id?: number;
  permission_name?: string;
  threshold?: number;
  operations?: string;
  keys?: TronPermissionKey[];
};

export type TronAccountPermissions = {
  owner_permission?: TronPermission;
  active_permission?: TronPermission[];
};

export type SelectedTronPermission = {
  permissionId: number;
  permissionName: string;
  threshold: number;
  signerWeight: number;
  source: "owner" | "active";
};

function normalizeHexAddress(address: string) {
  return address.replace(/^0x/i, "").toLowerCase();
}

function permissionSignerWeight(permission: TronPermission | undefined, signerHex: string) {
  const signer = normalizeHexAddress(signerHex);
  return (permission?.keys ?? []).reduce((sum, key) => {
    return normalizeHexAddress(key.address ?? "") === signer ? sum + Number(key.weight ?? 0) : sum;
  }, 0);
}

export function permissionAllowsContractType(operations: string | undefined, contractType: number) {
  const clean = operations?.replace(/^0x/i, "").toLowerCase();
  if (!clean) return false;
  const byteIndex = Math.floor(contractType / 8);
  const bitIndex = contractType % 8;
  const byte = Number.parseInt(clean.slice(byteIndex * 2, byteIndex * 2 + 2), 16);
  return Number.isFinite(byte) && ((byte >> bitIndex) & 1) === 1;
}

export function selectAuthorizedTronPermission(params: {
  account: TronAccountPermissions;
  ownerAddress: string;
  signerAddress: string;
  contractType: number;
}): SelectedTronPermission {
  const signerHex = tronAddressToHex(params.signerAddress);
  const ownerHex = tronAddressToHex(params.ownerAddress);
  const signerMatchesOwner = normalizeHexAddress(signerHex) === normalizeHexAddress(ownerHex);
  const activePermissions = params.account.active_permission ?? [];
  const activeWithSigner = activePermissions.filter((permission) => {
    return permissionSignerWeight(permission, signerHex) > 0;
  });
  const activeAuthorized = activeWithSigner
    .filter((permission) =>
      permissionAllowsContractType(permission.operations, params.contractType),
    )
    .map((permission) => ({
      permission,
      signerWeight: permissionSignerWeight(permission, signerHex),
      threshold: Number(permission.threshold ?? 0),
    }))
    .filter((candidate) => candidate.signerWeight >= candidate.threshold)
    .sort((a, b) => Number(a.permission.id ?? 0) - Number(b.permission.id ?? 0))[0];

  if (activeAuthorized?.permission.id != null) {
    return {
      permissionId: Number(activeAuthorized.permission.id),
      permissionName: activeAuthorized.permission.permission_name ?? "active",
      threshold: activeAuthorized.threshold,
      signerWeight: activeAuthorized.signerWeight,
      source: "active",
    };
  }

  const ownerPermission = params.account.owner_permission;
  const ownerWeight = ownerPermission
    ? permissionSignerWeight(ownerPermission, signerHex)
    : signerMatchesOwner
      ? 1
      : 0;
  const ownerThreshold = Number(ownerPermission?.threshold ?? 1);
  if (ownerWeight >= ownerThreshold) {
    return {
      permissionId: 0,
      permissionName: ownerPermission?.permission_name ?? "owner",
      threshold: ownerThreshold,
      signerWeight: ownerWeight,
      source: "owner",
    };
  }

  if (activeWithSigner.length > 0) {
    const operationAllowed = activeWithSigner.some((permission) =>
      permissionAllowsContractType(permission.operations, params.contractType),
    );
    throw new Error(
      operationAllowed ? "TRON_SIGNER_WEIGHT_TOO_LOW" : "TRON_SIGNER_OPERATION_NOT_ALLOWED",
    );
  }

  throw new Error("TRON_SIGNER_NOT_AUTHORIZED");
}
