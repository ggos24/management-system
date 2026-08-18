/**
 * Attributes that keep credential autofill away from a plain text field.
 *
 * iOS Safari offers Passwords AutoFill — and with it the Face ID / passkey
 * sheet — on any text field it heuristically reads as a sign-in field, which it
 * does readily on an origin that has a saved login (this app has one). A field
 * that can never hold a credential should opt out: `autocomplete="off"` plus a
 * neutral `name` covers the browser, and the `data-*` flags cover 1Password,
 * LastPass and Dashlane, which ignore `autocomplete`.
 *
 * Spread this onto search boxes, filters and free-text fields — never onto the
 * real login form, which *should* autofill.
 */
export const noAutofillProps = {
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'none',
  spellCheck: false,
  'data-1p-ignore': true,
  'data-lpignore': 'true',
  'data-form-type': 'other',
} as const;

/** Same opt-out for prose fields, where sentence casing and spellcheck are wanted. */
export const noAutofillProseProps = {
  ...noAutofillProps,
  autoCapitalize: 'sentences',
  spellCheck: true,
} as const;
