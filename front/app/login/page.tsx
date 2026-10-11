'use client';

import type { ChangeEvent, FormEvent } from 'react';
import { useState } from 'react';
import { isBffErrorBody } from '../../lib/types/auth';

interface LoginFormState {
  email: string;
  password: string;
}

const INITIAL_FORM_STATE: LoginFormState = { email: '', password: '' };

export default function LoginPage() {
  const [form, setForm] = useState<LoginFormState>(INITIAL_FORM_STATE);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleEmailChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setForm((previous) => ({ ...previous, email: event.target.value }));
  };

  const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setForm((previous) => ({ ...previous, password: event.target.value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setErrorMessage(null);

    if (!form.email.trim() || !form.password.trim()) {
      setErrorMessage('Email et mot de passe sont requis.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const text = await response.text();
      const parsed: unknown = text ? JSON.parse(text) : null;

      if (!response.ok) {
        setErrorMessage(isBffErrorBody(parsed) ? parsed.error : 'Connexion impossible.');
        return;
      }

      window.location.assign('/');
    } catch {
      setErrorMessage('Connexion impossible. Vérifiez votre connexion.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <form
        onSubmit={handleSubmit}
        aria-label="Formulaire de connexion"
        style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '320px' }}
      >
        <h1 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Connexion</h1>

        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          value={form.email}
          onChange={handleEmailChange}
          aria-required="true"
          required
        />

        <label htmlFor="login-password">Mot de passe</label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={form.password}
          onChange={handlePasswordChange}
          aria-required="true"
          required
        />

        {errorMessage && (
          <p role="alert" style={{ color: '#d32f2f' }}>
            {errorMessage}
          </p>
        )}

        <button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
          {isSubmitting ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </main>
  );
}
