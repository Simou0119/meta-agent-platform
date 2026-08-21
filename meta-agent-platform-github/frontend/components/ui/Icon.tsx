import Image from "next/image";
import {
  Info,
  ArrowUp,
  Wrench,
  Bot,
  MessageSquare,
  ChevronDown,
  ExternalLink,
  MessageSquareShare,
  Filter,
  Layout,
  Link,
  Mic,
  FolderPlus,
  Sparkles,
  LayoutTemplate,
  PinOff
} from "lucide-react";

export type IconName =
  | "about"
  | "arrowUp"
  | "builder"
  | "bot"
  | "chat"
  | "chevronDown"
  | "external"
  | "feedback"
  | "filter"
  | "layout"
  | "link"
  | "logo"
  | "mic"
  | "plusFolder"
  | "spark"
  | "templates"
  | "test"
  | "unpin";

type IconProps = {
  name: IconName;
  className?: string;
};

export function Icon({ name, className = "size-5" }: IconProps) {
  if (name === "logo") {
    return <Image src="/logo.svg" alt="" width={24} height={24} className={className} aria-hidden />;
  }

  const iconMap: Record<Exclude<IconName, "logo">, React.ElementType> = {
    about: Info,
    arrowUp: ArrowUp,
    builder: Wrench,
    bot: Bot,
    chat: MessageSquare,
    chevronDown: ChevronDown,
    external: ExternalLink,
    feedback: MessageSquareShare,
    filter: Filter,
    layout: Layout,
    link: Link,
    mic: Mic,
    test: Sparkles,
    plusFolder: FolderPlus,
    spark: Sparkles,
    templates: LayoutTemplate,
    unpin: PinOff,
  };

  const LucideIcon = iconMap[name];

  return <LucideIcon className={className} aria-hidden />;
}
