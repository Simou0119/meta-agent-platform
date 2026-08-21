"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { LockKeyhole, UserRound } from "lucide-react";

type LoginPageProps = {
  onLogin: (credentials: { username: string; password: string }) => Promise<{ ok: true } | { ok: false; error: string }>;
};

export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!username.trim() || !password.trim()) {
      setError("Please enter your username and password.");
      return;
    }

    setIsSubmitting(true);
    const result = await onLogin({ username, password });
    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.error);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#EDF2F8] px-6 py-10 text-[#182c42] sm:px-10">
      <div className="flex w-full max-w-[920px] flex-col items-center justify-center gap-10 md:flex-row md:gap-16 lg:gap-24">
        <Image
          src="/login_bg1.png"
          alt="Robotics and Embedded Systems"
          width={631}
          height={272}
          priority
          className="h-auto w-full max-w-[400px] shrink-0"
        />

      <section className="w-full max-w-[374px] rounded-md bg-white/90 px-6 py-6 shadow-[0_2px_12px_rgba(15,35,55,0.22)] backdrop-blur-sm">
        <h1 className="text-[28px] font-bold leading-tight text-[#2f629d]">User Login</h1>
        <p className="mt-2 text-[14px] text-[#15283d]">
          Sign in to your account
        </p>

        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <label className="flex h-[34px] items-center rounded-[3px] border-2 border-[#19324c] bg-white px-2 shadow-[inset_0_1px_1px_rgba(0,0,0,0.05)]">
            <UserRound className="mr-2 size-[17px] shrink-0 text-[#19324c]" aria-hidden />
            <span className="sr-only">Email</span>
            <input
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                setError("");
              }}
              className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-[#13283d] outline-none placeholder:text-[#6b7480]"
              placeholder="Email"
              type="text"
              autoComplete="username"
            />
          </label>

          <label className="flex h-[34px] items-center rounded-[3px] border-2 border-[#19324c] bg-white px-2 shadow-[inset_0_1px_1px_rgba(0,0,0,0.05)]">
            <LockKeyhole className="mr-2 size-[17px] shrink-0 text-[#19324c]" aria-hidden />
            <span className="sr-only">Password</span>
            <input
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError("");
              }}
              className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-[#13283d] outline-none placeholder:text-[#6b7480]"
              placeholder="Password"
              type="password"
              autoComplete="current-password"
            />
          </label>

          {error ? <p className="text-[12px] font-medium text-[#b42318]">{error}</p> : null}

          <button
            className="h-[34px] w-full rounded-[3px] bg-[#3569b8] text-[14px] font-bold text-white shadow-[0_1px_2px_rgba(25,50,76,0.2)] transition hover:bg-[#2f5fa8] disabled:cursor-not-allowed disabled:bg-[#7f9dca] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3569b8]"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Signing In..." : "Sign In"}
          </button>
        </form>

        {/* <div className="mt-3 text-right">
          <button className="text-[12px] text-[#24627f] hover:underline" type="button">
            Forgot your password?
          </button>
        </div> */}

        <p className="mt-2 text-center text-[12px] text-[#1f2a35]">
          Don&apos;t have an account? <span className="text-[#24627f]">Register</span>
        </p>

        {/* <p className="mt-5 text-center text-[10px] leading-relaxed text-[#1f2a35]">
          By signing in, you agree to our <span className="text-[#24627f]">Terms of Use</span> and{" "}
          <span className="text-[#24627f]">Privacy Policy</span>.
        </p> */}
      </section>
      </div>
    </main>
  );
}
