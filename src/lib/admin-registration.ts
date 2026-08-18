export function assertAdminRegistrationCode(
  inputCode: string | undefined,
  expectedCode: string | undefined,
) {
  if (!expectedCode) {
    throw new Error(
      "Administrator self-registration is disabled. Configure ADMIN_REGISTRATION_CODE to enable it.",
    );
  }
  if (inputCode !== expectedCode) {
    throw new Error("Invalid administrator registration code");
  }
}
