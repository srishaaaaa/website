import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '../context/App';

export default function Toasts() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.button key={t.id} layout className={`toast ${t.type}`} onClick={() => dismissToast(t.id)} aria-label={`${t.message} Dismiss.`}
            initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.96 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
            {t.message}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
