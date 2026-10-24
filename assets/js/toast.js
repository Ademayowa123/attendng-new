/*************************************************
 * TOAST.JS
 * AttendNG Centralized Notification Toast System
 *
 * Provides non-blocking, modern notifications to replace
 * native browser alert() dialogs across the platform.
 * Supports: 'success' | 'error' | 'warning' | 'info'
 *************************************************/

(function () {

    // Inject styles once if not already present
    function ensureStyles() {
        if (document.getElementById("attendngToastStyles")) return;
        const style = document.createElement("style");
        style.id = "attendngToastStyles";
        style.textContent = `
            .attendng-toast-container {
                position: fixed;
                top: 24px;
                right: 24px;
                z-index: 99999;
                display: flex;
                flex-direction: column;
                gap: 10px;
                max-width: 400px;
                width: calc(100vw - 32px);
                pointer-events: none;
            }
            .attendng-toast {
                position: relative;
                pointer-events: auto;
                display: flex;
                align-items: flex-start;
                gap: 12px;
                padding: 14px 16px;
                border-radius: 12px;
                background: #0f172a;
                color: #f8fafc;
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2);
                border: 1px solid rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(8px);
                opacity: 0;
                transform: translateY(-16px) scale(0.96);
                transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                overflow: hidden;
                font-family: "Poppins", system-ui, -apple-system, sans-serif;
            }
            .attendng-toast.attendng-toast-visible {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
            .attendng-toast.attendng-toast-hiding {
                opacity: 0;
                transform: translateY(-8px) scale(0.95);
            }
            .attendng-toast-icon {
                font-size: 18px;
                line-height: 1.3;
                flex-shrink: 0;
                margin-top: 1px;
            }
            .attendng-toast-body {
                flex: 1;
                min-width: 0;
            }
            .attendng-toast-message {
                font-size: 13.5px;
                line-height: 1.45;
                color: #e2e8f0;
                word-break: break-word;
            }
            .attendng-toast-close {
                background: transparent;
                border: none;
                color: #94a3b8;
                font-size: 20px;
                line-height: 1;
                cursor: pointer;
                padding: 0 4px;
                margin-left: 4px;
                margin-top: -2px;
                transition: color 0.15s;
            }
            .attendng-toast-close:hover {
                color: #ffffff;
            }
            .attendng-toast-success {
                border-left: 4px solid #10b981;
            }
            .attendng-toast-success .attendng-toast-icon {
                color: #10b981;
            }
            .attendng-toast-error {
                border-left: 4px solid #ef4444;
            }
            .attendng-toast-error .attendng-toast-icon {
                color: #ef4444;
            }
            .attendng-toast-warning {
                border-left: 4px solid #f59e0b;
            }
            .attendng-toast-warning .attendng-toast-icon {
                color: #f59e0b;
            }
            .attendng-toast-info {
                border-left: 4px solid #0d9488;
            }
            .attendng-toast-info .attendng-toast-icon {
                color: #14b8a6;
            }
            .attendng-toast-progress {
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                height: 3px;
                background: rgba(255, 255, 255, 0.08);
            }
            .attendng-toast-progress-bar {
                height: 100%;
                width: 100%;
                background: rgba(255, 255, 255, 0.3);
                animation: attendng-toast-shrink linear forwards;
                transform-origin: left;
            }
            .attendng-toast-success .attendng-toast-progress-bar { background: #10b981; }
            .attendng-toast-error .attendng-toast-progress-bar { background: #ef4444; }
            .attendng-toast-warning .attendng-toast-progress-bar { background: #f59e0b; }
            .attendng-toast-info .attendng-toast-progress-bar { background: #14b8a6; }
            @keyframes attendng-toast-shrink {
                from { transform: scaleX(1); }
                to { transform: scaleX(0); }
            }
            @media (max-width: 600px) {
                .attendng-toast-container {
                    top: 16px;
                    left: 16px;
                    right: 16px;
                    width: auto;
                    max-width: none;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Ensure container exists
    function getOrCreateContainer() {
        ensureStyles();
        let container = document.getElementById("attendngToastContainer");
        if (!container) {
            container = document.createElement("div");
            container.id = "attendngToastContainer";
            container.className = "attendng-toast-container";
            document.body.appendChild(container);
        }
        return container;
    }

    const ICONS = {
        success: "fa-solid fa-circle-check",
        error: "fa-solid fa-circle-xmark",
        warning: "fa-solid fa-triangle-exclamation",
        info: "fa-solid fa-circle-info"
    };

    /**
     * Show a modern toast notification
     * @param {string} message - Notification text
     * @param {('success'|'error'|'warning'|'info')} type - Notification style
     * @param {number} duration - Auto-dismiss timeout in ms (default: 4000)
     */
    function showToast(message, type = "info", duration = 4000) {
        if (!message) return;

        // If DOM isn't ready yet, defer
        if (!document.body) {
            document.addEventListener("DOMContentLoaded", () => showToast(message, type, duration));
            return;
        }

        const normalizedType = ["success", "error", "warning", "info"].includes(type) ? type : "info";
        const container = getOrCreateContainer();

        const toast = document.createElement("div");
        toast.className = `attendng-toast attendng-toast-${normalizedType}`;
        toast.setAttribute("role", "alert");
        toast.setAttribute("aria-live", "assertive");

        const iconClass = ICONS[normalizedType];

        toast.innerHTML = `
            <div class="attendng-toast-icon">
                <i class="${iconClass}"></i>
            </div>
            <div class="attendng-toast-body">
                <div class="attendng-toast-message">${escapeHtml(message)}</div>
            </div>
            <button type="button" class="attendng-toast-close" aria-label="Dismiss notification">&times;</button>
            <div class="attendng-toast-progress">
                <div class="attendng-toast-progress-bar" style="animation-duration: ${duration}ms;"></div>
            </div>
        `;

        container.appendChild(toast);

        // Trigger entrance animation
        requestAnimationFrame(() => {
            toast.classList.add("attendng-toast-visible");
        });

        let dismissTimeout = null;
        let startTime = Date.now();
        let remaining = duration;

        function startTimer() {
            startTime = Date.now();
            dismissTimeout = setTimeout(dismiss, remaining);
        }

        function pauseTimer() {
            if (dismissTimeout) {
                clearTimeout(dismissTimeout);
                remaining -= Date.now() - startTime;
                const progressBar = toast.querySelector(".attendng-toast-progress-bar");
                if (progressBar) {
                    progressBar.style.animationPlayState = "paused";
                }
            }
        }

        function resumeTimer() {
            if (remaining > 0) {
                const progressBar = toast.querySelector(".attendng-toast-progress-bar");
                if (progressBar) {
                    progressBar.style.animationPlayState = "running";
                }
                startTimer();
            }
        }

        function dismiss() {
            if (dismissTimeout) clearTimeout(dismissTimeout);
            toast.classList.remove("attendng-toast-visible");
            toast.classList.add("attendng-toast-hiding");
            toast.addEventListener(
                "transitionend",
                () => {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                },
                { once: true }
            );
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }

        const closeBtn = toast.querySelector(".attendng-toast-close");
        if (closeBtn) {
            closeBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                dismiss();
            });
        }

        toast.addEventListener("mouseenter", pauseTimer);
        toast.addEventListener("mouseleave", resumeTimer);

        if (duration > 0) {
            startTimer();
        }

        // Backwards compatibility with legacy #toast elements
        const legacyToast = document.getElementById("toast");
        if (legacyToast && legacyToast !== container) {
            legacyToast.textContent = message;
            legacyToast.classList.add("show");
            setTimeout(() => legacyToast.classList.remove("show"), duration);
        }

        return { dismiss };
    }

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    // Export globally
    window.showToast = showToast;
    window.AttendNGToast = {
        show: showToast,
        success: (msg, duration) => showToast(msg, "success", duration),
        error: (msg, duration) => showToast(msg, "error", duration),
        warning: (msg, duration) => showToast(msg, "warning", duration),
        info: (msg, duration) => showToast(msg, "info", duration)
    };

})();
