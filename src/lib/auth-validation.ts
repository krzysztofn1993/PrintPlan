export type SignUpField = "email" | "password" | "confirmPassword";
export type SignInField = "email" | "password";

export type FieldErrors<Field extends string> = Partial<Record<Field, string>>;
export type ValidationCode = "required" | "invalid" | "too_short" | "confirmation_required" | "mismatch";
export type FieldErrorCodes<Field extends string> = Partial<Record<Field, ValidationCode>>;

export interface SignUpInput {
  email: string;
  password: string;
  confirmPassword: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

export const SIGN_UP_FIELD_MESSAGES: Record<SignUpField, string> = {
  email: "Enter a valid email address",
  password: "Password must be at least 6 characters",
  confirmPassword: "Passwords do not match",
};

export const SIGN_IN_FIELD_MESSAGES: Record<SignInField, string> = {
  email: "Enter a valid email address",
  password: "Password is required",
};

export const MIN_PASSWORD_LENGTH = 6;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailError(value: unknown): { message: string; code: ValidationCode } | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { message: "Email is required", code: "required" };
  }
  if (!EMAIL_PATTERN.test(value)) return { message: SIGN_UP_FIELD_MESSAGES.email, code: "invalid" };
  return undefined;
}

function singleStringField(form: FormData, name: string): string | undefined {
  const values = form.getAll(name);
  if (values.length !== 1 || typeof values[0] !== "string") return undefined;
  return values[0];
}

export function validateSignUpInput(input: { email: unknown; password: unknown; confirmPassword: unknown }): {
  data?: SignUpInput;
  errors: FieldErrors<SignUpField>;
  errorCodes: FieldErrorCodes<SignUpField>;
} {
  const errors: FieldErrors<SignUpField> = {};
  const errorCodes: FieldErrorCodes<SignUpField> = {};
  const emailIssue = emailError(input.email);
  if (emailIssue) {
    errors.email = emailIssue.message;
    errorCodes.email = emailIssue.code;
  }

  if (typeof input.password !== "string" || input.password.length === 0) {
    errors.password = "Password is required";
    errorCodes.password = "required";
  } else if (input.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = SIGN_UP_FIELD_MESSAGES.password;
    errorCodes.password = "too_short";
  }

  if (typeof input.confirmPassword !== "string" || input.confirmPassword.length === 0) {
    errors.confirmPassword = "Please confirm your password";
    errorCodes.confirmPassword = "confirmation_required";
  } else if (typeof input.password === "string" && input.password !== input.confirmPassword) {
    errors.confirmPassword = SIGN_UP_FIELD_MESSAGES.confirmPassword;
    errorCodes.confirmPassword = "mismatch";
  }

  if (Object.keys(errors).length > 0) return { errors, errorCodes };

  return {
    data: {
      email: input.email as string,
      password: input.password as string,
      confirmPassword: input.confirmPassword as string,
    },
    errors,
    errorCodes,
  };
}

export function validateSignInInput(input: { email: unknown; password: unknown }): {
  data?: SignInInput;
  errors: FieldErrors<SignInField>;
  errorCodes: FieldErrorCodes<SignInField>;
} {
  const errors: FieldErrors<SignInField> = {};
  const errorCodes: FieldErrorCodes<SignInField> = {};
  const emailIssue = emailError(input.email);
  if (emailIssue) {
    errors.email = emailIssue.message;
    errorCodes.email = emailIssue.code;
  }

  if (typeof input.password !== "string" || input.password.length === 0) {
    errors.password = SIGN_IN_FIELD_MESSAGES.password;
    errorCodes.password = "required";
  }

  if (Object.keys(errors).length > 0) return { errors, errorCodes };

  return {
    data: {
      email: input.email as string,
      password: input.password as string,
    },
    errors,
    errorCodes,
  };
}

const SIGN_UP_MESSAGES_BY_CODE: Record<SignUpField, Partial<Record<ValidationCode, string>>> = {
  email: { required: "Email is required", invalid: SIGN_UP_FIELD_MESSAGES.email },
  password: { required: "Password is required", too_short: SIGN_UP_FIELD_MESSAGES.password },
  confirmPassword: {
    confirmation_required: "Please confirm your password",
    mismatch: SIGN_UP_FIELD_MESSAGES.confirmPassword,
  },
};

const SIGN_IN_MESSAGES_BY_CODE: Record<SignInField, Partial<Record<ValidationCode, string>>> = {
  email: { required: "Email is required", invalid: SIGN_IN_FIELD_MESSAGES.email },
  password: { required: SIGN_IN_FIELD_MESSAGES.password },
};

export function getSignUpFieldError(field: SignUpField, code: ValidationCode): string | undefined {
  const messages = SIGN_UP_MESSAGES_BY_CODE[field];
  return Object.hasOwn(messages, code) ? messages[code] : undefined;
}

export function getSignInFieldError(field: SignInField, code: ValidationCode): string | undefined {
  const messages = SIGN_IN_MESSAGES_BY_CODE[field];
  return Object.hasOwn(messages, code) ? messages[code] : undefined;
}

export async function readAuthFormData(request: Request): Promise<FormData | null> {
  try {
    return await request.formData();
  } catch {
    return null;
  }
}

export function validateSignUpForm(form: FormData) {
  return validateSignUpInput({
    email: singleStringField(form, "email"),
    password: singleStringField(form, "password"),
    confirmPassword: singleStringField(form, "confirmPassword"),
  });
}

export function validateSignInForm(form: FormData) {
  return validateSignInInput({
    email: singleStringField(form, "email"),
    password: singleStringField(form, "password"),
  });
}
