import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({ children, variant = "secondary", className = "", ...props }: ButtonProps) {
  const variants = {
    primary:
      "border-[#5865f2] bg-[#5865f2] text-white shadow-[0_2px_6px_rgba(88,101,242,0.28)] hover:bg-[#4d59e7]",
    secondary:
      "border-[#dedede] bg-white text-[#33363b] shadow-[0_1px_2px_rgba(0,0,0,0.06)] hover:bg-[#fafafa]",
    ghost: "border-transparent bg-transparent text-[#303238] hover:bg-black/5",
  };

  return (
    <button
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-md border px-3.5 text-[16px] font-medium transition ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
