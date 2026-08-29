import { Trx } from "tronweb";

export function signGasFreePermitTypedData(input: {
  domain: unknown;
  types: unknown;
  message: unknown;
  privateKeyHex: string;
}) {
  const signer = Trx as unknown as {
    signTypedData?: (
      domain: unknown,
      types: unknown,
      message: unknown,
      privateKey: string,
    ) => string;
    _signTypedData?: (
      domain: unknown,
      types: unknown,
      message: unknown,
      privateKey: string,
    ) => string;
  };
  const sign = signer.signTypedData ?? signer._signTypedData;
  if (typeof sign !== "function") {
    throw new Error("GasFree typed-data signer is unavailable.");
  }
  const signature = sign(input.domain, input.types, input.message, input.privateKeyHex).replace(
    /^0x/,
    "",
  );
  if (!/^[0-9a-fA-F]{130}$/.test(signature)) {
    throw new Error("GasFree typed-data signature format is invalid.");
  }
  return signature;
}
