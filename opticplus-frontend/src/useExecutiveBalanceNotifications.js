import { useCallback, useEffect, useRef, useState } from 'react'

const EMPTY_CHANGES = []

export default function useExecutiveBalanceNotifications({ apiFetch, token, session }) {
  const [summary, setSummary] = useState(null)
  const [changes, setChanges] = useState(EMPTY_CHANGES)
  const [error, setError] = useState('')
  const [pushMessage, setPushMessage] = useState('')
  const [isUpdatingPush, setIsUpdatingPush] = useState(false)
  const previousBalances = useRef(null)
  const isCeo = session?.role === 'ceo'
  const pushEnabled = Boolean(summary?.push?.enabled)
  const isSubscribed = Boolean(summary?.push?.subscribed)
  const pushSupported = typeof window !== 'undefined'
    && window.isSecureContext
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window

  const addChanges = useCallback((incoming) => {
    if (!incoming.length) return

    setChanges((current) => {
      const byKey = new Map(current.map((change) => [change.key, change]))
      incoming.forEach((change) => byKey.set(change.key, change))
      return [...byKey.values()].slice(-20)
    })
  }, [])

  useEffect(() => {
    if (!isCeo || !token) {
      setSummary(null)
      setChanges(EMPTY_CHANGES)
      setError('')
      setPushMessage('')
      previousBalances.current = null
      return undefined
    }

    let cancelled = false
    const loadBalances = async () => {
      try {
        const next = await apiFetch('/executive/bank-balances', { token })
        if (cancelled) return

        const accounts = next.accounts ?? []
        const currentBalances = new Map()
        const changedAccounts = []
        accounts.forEach((account) => {
          const balance = account.reported_balance === null ? null : Number(account.reported_balance)
          currentBalances.set(Number(account.id), balance)
          const accountId = Number(account.id)
          const previousBalance = previousBalances.current?.get(accountId)
          if (previousBalances.current?.has(accountId) && balance !== null && previousBalance !== balance) {
            changedAccounts.push(makeBalanceChange(account, previousBalance, balance))
          }
        })

        if (previousBalances.current) addChanges(changedAccounts)
        previousBalances.current = currentBalances
        setSummary(next)
        setError('')
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Could not load bank balance updates.')
      }
    }

    loadBalances()
    const intervalId = window.setInterval(loadBalances, 30_000)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [addChanges, apiFetch, isCeo, token])

  useEffect(() => {
    if (changes.length === 0) return

    navigator.setAppBadge?.(changes.length)?.catch((badgeError) => {
      console.warn('The installed app badge could not be updated.', badgeError)
    })
  }, [changes])

  useEffect(() => {
    if (!isCeo || !pushSupported) return undefined

    let cancelled = false
    const handlePushMessage = (event) => {
      if (event.data?.type !== 'opticplus:bank-balance-change') return
      if (!cancelled) {
        addChanges([makeBalanceChange(event.data, event.data.previous_balance, event.data.balance)])
        event.ports[0]?.postMessage({ handled: true })
      }
    }
    navigator.serviceWorker.addEventListener('message', handlePushMessage)

    const syncExistingSubscription = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js')
        const subscription = await registration.pushManager.getSubscription()
        if (!cancelled && subscription && summary?.push?.enabled && !summary.push.subscribed) {
          await apiFetch('/executive/bank-balances/subscription', {
            method: 'POST',
            token,
            body: { subscription: subscription.toJSON() },
          })
          setSummary((current) => current ? { ...current, push: { ...current.push, subscribed: true } } : current)
        }
      } catch (registrationError) {
        if (!cancelled) setPushMessage(registrationError.message || 'Phone balance alerts could not be registered.')
      }
    }

    syncExistingSubscription()

    return () => {
      cancelled = true
      navigator.serviceWorker.removeEventListener('message', handlePushMessage)
    }
  }, [addChanges, apiFetch, isCeo, pushSupported, summary?.push?.enabled, summary?.push?.subscribed, token])

  const enablePhoneNotifications = useCallback(async () => {
    if (!pushSupported) {
      setPushMessage('Phone balance alerts require HTTPS and a browser that supports web push.')
      return
    }
    if (!pushEnabled) {
      setPushMessage('Phone balance alerts are not configured on the server yet.')
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
          ? 'Notifications are blocked in this browser or phone settings.'
          : 'Notification permission was not granted.')
      }

      const registration = await navigator.serviceWorker.register('/sw.js')
      const serverKey = summary?.push?.public_key
      if (!serverKey) throw new Error('The server did not provide a push notification key.')

      const subscription = await registration.pushManager.getSubscription()
        ?? await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeApplicationServerKey(serverKey),
        })
      await apiFetch('/executive/bank-balances/subscription', {
        method: 'POST',
        token,
        body: { subscription: subscription.toJSON() },
      })
      setSummary((current) => current ? { ...current, push: { ...current.push, subscribed: true } } : current)
      setPushMessage('Phone alerts for bank and MoMo balance changes are enabled.')
    } catch (pushError) {
      setPushMessage(pushError.message || 'Could not enable phone balance alerts.')
    } finally {
      setIsUpdatingPush(false)
    }
  }, [apiFetch, pushEnabled, pushSupported, summary?.push?.public_key, token])

  const disablePhoneNotifications = useCallback(async () => {
    if (!pushSupported) return

    setIsUpdatingPush(true)
    setPushMessage('')
    try {
      const registration = await navigator.serviceWorker.getRegistration('/')
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        await apiFetch('/executive/bank-balances/subscription', {
          method: 'DELETE',
          token,
          body: { endpoint: subscription.endpoint },
        })
        await subscription.unsubscribe()
      }
      setSummary((current) => current ? { ...current, push: { ...current.push, subscribed: false } } : current)
      setPushMessage('Phone alerts for bank balance changes are disabled.')
    } catch (pushError) {
      setPushMessage(pushError.message || 'Could not disable phone balance alerts.')
    } finally {
      setIsUpdatingPush(false)
    }
  }, [apiFetch, pushSupported, token])

  const dismissChanges = useCallback(() => {
    setChanges([])
    const badgePromise = navigator.clearAppBadge?.()
    badgePromise?.catch((badgeError) => {
      console.warn('The installed app badge could not be cleared.', badgeError)
    })
  }, [])

  return {
    changes,
    error,
    isSubscribed,
    isUpdatingPush,
    pushEnabled,
    pushMessage,
    pushSupported,
    enablePhoneNotifications,
    disablePhoneNotifications,
    dismissChanges,
  }
}

function makeBalanceChange(account, previousBalance, balance) {
  const branchId = Number(account.branch_id)
  const accountId = Number(account.account_id ?? account.id)
  const changedAt = account.changed_at ?? account.reported_balance_at ?? ''

  return {
    key: `${accountId}:${changedAt}:${Number(balance)}`,
    bankName: account.bank_name ?? 'Bank account',
    accountLabel: account.account_label || (account.account_suffix ? `•••• ${account.account_suffix}` : 'Account'),
    branchName: branchId === 2 ? 'Madina' : branchId === 1 ? 'Labadi' : 'Branch',
    previousBalance: previousBalance == null ? null : Number(previousBalance),
    balance: Number(balance),
  }
}

function decodeApplicationServerKey(value) {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = padded.replaceAll('-', '+').replaceAll('_', '/')
  const raw = window.atob(base64)
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}
