// Maps backend registration error payloads to localised messages.
// Backend sends either `{ error: 'CODE', message: '...', statusCode }` for
// known Supabase auth errors, or a plain Nest default body for everything else.

type Translator = (key: string) => string;

interface RegisterErrorBody {
  error?: string;
  message?: string;
}

export function mapRegisterError(body: RegisterErrorBody, t: Translator): string {
  const code = body?.error;
  if (code === 'weak_password') return t('errorWeakPassword');
  if (code === 'user_already_exists' || code === 'email_exists' || code === 'email_address_exists') {
    return t('errorEmailExists');
  }
  if (code === 'validation_failed' || code === 'email_address_invalid' || code === 'invalid_email') {
    return t('errorInvalidEmail');
  }
  return body?.message || t('errorRegisterFailed');
}
