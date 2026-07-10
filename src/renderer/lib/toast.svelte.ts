type ToastType = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  message: string
  type: ToastType
}

let toasts = $state<Toast[]>([])
let nextId = 0

export function getToasts() {
  return toasts
}

export function showToast(message: string, type: ToastType = 'info', duration = 4000) {
  const id = nextId++
  toasts = [...toasts, { id, message, type }]
  setTimeout(() => {
    toasts = toasts.filter(t => t.id !== id)
  }, duration)
}

export function dismissToast(id: number) {
  toasts = toasts.filter(t => t.id !== id)
}
