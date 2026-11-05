import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const EMPTY_COUNTS = { memos: 0, expenses: 0, sms_reviews: 0, total: 0 }

export default function useManagerNotifications({ apiFetch, token, session, branchId }) {
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  const [isUpdatingPush, setIsUpdatingPush] = useState(false)
  const [pushMessage, setPushMessage] = useState('')
  const [dismissedKey, setDismissedKey] = useState('')
  const previousCounts = useRef(null)
  const isManager = (session?.normalized_role ?? session?.role) === 'manager'
  const counts = summary?.counts ?? EMPTY_COUNTS
  const notificationKey = `${branchId}:${counts.memos}:${counts.expenses}:${counts.sms_reviews}`
  const isBannerOpen = counts.total > 0 && dismissedKey !== notificationKey
  const pushEnabled = Boolean(summary?.push?.enabled)
  const isSubscribed = Boolean(summary?.push?.subscribed)
  const pushSupported = typeof window !== 'undefined'
    && window.isSecureContext
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window

  useEffect(() => {
    if (!isManager || !token) {
      setSummary(null)
      setError('')
      previousCounts.current = null
      return undefined
    }

    let cancelled = false
    const loadSummary = async () => {
      try {
        const next = await apiFetch(`/manager/notifications?branch_id=${branchId}`, { token })
        if (cancelled) return

        const nextCounts = {
          memos: Number(next.counts?.memos ?? 0),
          expenses: Number(next.counts?.expenses ?? 0),
          sms_reviews: Number(next.counts?.sms_reviews ?? 0),
        }
        if (previousCounts.current && Object.keys(nextCounts).some(
          (key) => nextCounts[key] > previousCounts.current[key],
        )) {
          setDismissedKey('')
        }
        previousCounts.current = nextCounts
        setSummary(next)
        setError('')
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Could not load approval notifications.')
      }
    }

    loadSummary()
    const timerId = window.setInterval(loadSummary, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(timerId)
    }
  }, [apiFetch, branchId, isManager, token])

  useEffect(() => {
    if (!isManager || !pushSupported) return undefined

    let cancelled = false
    const syncExistingSubscription = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js')
        const subscription = await registration.pushManager.getSubscription()
        if (!cancelled && subscription && summary?.push?.enabled && !summary.push.subscribed) {
          await apiFetch('/manager/notifications/subscription', {
            method: 'POST',
            token,
            body: {
              branch_id: branchId,
              subscription: subscription.toJSON(),
            },
          })
        }
      } catch (registrationError) {
        if (!cancelled) {
          setPushMessage(registrationError.message || 'The phone notification service could not be registered.')
        }
      }
    }

    syncExistingSubscription()

    return () => {
      cancelled = true
    }
  }, [apiFetch, branchId, isManager, pushSupported, summary?.push?.enabled, summary?.push?.subscribed, token])

  useEffect(() => {
    if (!isManager || typeof navigator === 'undefined') return

    const total = Number(counts.total) || 0
    const badgePromise = total > 0
      ? navigator.setAppBadge?.(total)
      : navigator.clearAppBadge?.()
    badgePromise?.catch((badgeError) => {
      console.warn('The browser could not update the installed app badge.', badgeError)
    })
  }, [counts.total, isManager])

  const dismissBanner = useCallback(() => {
    setDismissedKey(notificationKey)
  }, [notificationKey])

  const setPhoneNotifications = useCallback(async () => {
    if (!pushSupported) {
      setPushMessage('Install OPTICPLUS as an app and open it over HTTPS in a browser that supports web push.')
      return
    }
    if (!pushEnabled) {
      setPushMessage('Phone alerts are not configured on the server yet.')
      return
    }

    setIsUpdatingPush(true)
    setPushMessage('')
    try {
      const permission = Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission
      if (permission !== 'granted') {
        throw new Error(permission === 'denied'
          ? 'Notifications are blocked in this browser. Allow them in the browser or phone settings.'
          : 'Notification permission was not granted.')
      }

      const registration = await navigator.serviceWorker.register('/sw.js')
      const serverKey = summary?.push?.public_key
      if (!serverKey) throw new Error('The server did not provide a push notification key.')

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeApplicationServerKey(serverKey),
      })
      await apiFetch('/manager/notifications/subscription', {
        method: 'POST',
        token,
        body: {
          branch_id: branchId,
          subscription: subscription.toJSON(),
        },
      })
      setSummary((current) => current ? { ...current, push: { ...current.push, subscribed: true } } : current)
      setPushMessage('Phone notifications are enabled on this device.')
    } catch (pushError) {
      setPushMessage(pushError.message || 'Could not enable phone notifications.')
    } finally {
      setIsUpdatingPush(false)
    }
  }, [apiFetch, branchId, pushEnabled, pushSupported, summary?.push?.public_key, token])

  const removePhoneNotifications = useCallback(async () => {
    if (!pushSupported) return

    setIsUpdatingPush(true)
    setPushMessage('')
    try {
      const registration = await navigator.serviceWorker.getRegistration('/')
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        await apiFetch('/manager/notifications/subscription', {
          method: 'DELETE',
          token,
          body: { endpoint: subscription.endpoint },
        })
        await subscription.unsubscribe()
      }
      setSummary((current) => current ? { ...current, push: { ...current.push, subscribed: false } } : current)
      setPushMessage('Phone notifications are disabled on this device.')
    } catch (pushError) {
      setPushMessage(pushError.message || 'Could not disable phone notifications.')
    } finally {
      setIsUpdatingPush(false)
    }
  }, [apiFetch, pushSupported, token])

  const navCounts = useMemo(() => ({
    Memos: Number(counts.memos) || 0,
    Expenses: Number(counts.expenses) || 0,
    'Bank Deposits': Number(counts.sms_reviews) || 0,
  }), [counts.expenses, counts.memos, counts.sms_reviews])

  return {
    counts,
    error,
    isBannerOpen,
    isSubscribed,
    isUpdatingPush,
    navCounts,
    pushEnabled,
    pushMessage,
    pushSupported,
    dismissBanner,
    enablePhoneNotifications: setPhoneNotifications,
    disablePhoneNotifications: removePhoneNotifications,
  }
}

function decodeApplicationServerKey(value) {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = padded.replaceAll('-', '+').replaceAll('_', '/')
  const raw = window.atob(base64)
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}
