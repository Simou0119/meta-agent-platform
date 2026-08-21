"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { Button } from "./Button";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={(o) => !o && onCancel()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" />
        <RadixDialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[#dce4ee] bg-white p-6 shadow-xl focus:outline-none">
          <RadixDialog.Title className="text-[18px] font-semibold text-[#202126]">
            {title}
          </RadixDialog.Title>
          <RadixDialog.Description className="mt-2 text-[15px] leading-6 text-[#73757a]">
            {description}
          </RadixDialog.Description>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className="border-[#d95117] bg-[#d95117] shadow-none hover:bg-[#c24613]"
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
