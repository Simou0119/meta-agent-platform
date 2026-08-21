import { Icon } from "../ui/Icon";

export function FloatingTools() {
  return (
    <div className="fixed right-0 top-[58%] z-10 hidden -translate-y-1/2 flex-col gap-4 xl:flex">
      <button
        className="flex size-12 translate-x-1 items-center justify-center rounded-full bg-white text-[#f197b6] shadow-[0_8px_22px_rgba(0,0,0,0.12)]"
        aria-label="Open quick actions"
      >
        <Icon name="spark" className="size-6" />
      </button>
      <button
        className="flex size-12 translate-x-1 items-center justify-center rounded-full bg-[#e79ab6] text-white shadow-[0_8px_22px_rgba(231,154,182,0.32)]"
        aria-label="Open assistant"
      >
        <Icon name="bot" className="size-7" />
      </button>
    </div>
  );
}
