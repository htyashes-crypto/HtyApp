import { create } from "zustand";

interface ConfirmRequest {
  title: string;
  message: string;
  danger?: boolean;
}

interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  danger: boolean;
  resolve: ((value: boolean) => void) | null;
  show: (req: ConfirmRequest) => Promise<boolean>;
  respond: (value: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>()((set, get) => ({
  open: false,
  title: "",
  message: "",
  danger: false,
  resolve: null,
  show: (req) => {
    return new Promise<boolean>((resolve) => {
      set({
        open: true,
        title: req.title,
        message: req.message,
        danger: req.danger ?? false,
        resolve
      });
    });
  },
  respond: (value) => {
    const { resolve } = get();
    if (resolve) resolve(value);
    set({ open: false, resolve: null });
  }
}));

export function confirm(title: string, message: string, danger?: boolean): Promise<boolean> {
  return useConfirmStore.getState().show({ title, message, danger });
}
