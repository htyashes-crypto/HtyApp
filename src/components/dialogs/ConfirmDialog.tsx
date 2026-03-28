import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useConfirmStore } from "../../state/confirm-store";

export function ConfirmDialog() {
  const { t } = useTranslation();
  const { open, title, message, danger, respond } = useConfirmStore();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="dialog-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={() => respond(false)}
        >
          <motion.div
            className="dialog confirm-dialog"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="confirm-dialog__header">
              <h3>{title}</h3>
            </div>
            <p className="confirm-dialog__message">{message}</p>
            <div className="confirm-dialog__actions">
              <button className="button button--ghost" onClick={() => respond(false)}>
                {t("common.cancel")}
              </button>
              <button
                className={danger ? "button button--danger" : "button button--primary"}
                onClick={() => respond(true)}
              >
                {t("common.confirm")}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
