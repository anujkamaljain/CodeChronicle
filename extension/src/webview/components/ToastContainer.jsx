import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useStore from '../store/useStore';

const ICONS = {
    success: '✓',
    error: '✗',
    info: 'ℹ',
    warning: '!',
};

export default function ToastContainer() {
    const { toasts, removeToast } = useStore();

    return (
        <div className="toast-container">
            <AnimatePresence>
                {toasts.map((toast) => (
                    <motion.div
                        key={toast.id}
                        initial={{ opacity: 0, x: 80, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 80, scale: 0.95 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                        className={`toast toast-${toast.type}`}
                    >
                        <div className="toast-icon">
                            {ICONS[toast.type] || 'ℹ'}
                        </div>
                        <div className="toast-body">
                            <div className="toast-message">{toast.message}</div>
                        </div>
                        <button
                            onClick={() => removeToast(toast.id)}
                            className="toast-close"
                            aria-label="Dismiss notification"
                            title="Dismiss"
                        >
                            ✕
                        </button>
                        {toast.duration > 0 && (
                            <div
                                className="toast-progress"
                                style={{
                                    animation: `toast-progress ${toast.duration}ms linear forwards`,
                                }}
                            />
                        )}
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
