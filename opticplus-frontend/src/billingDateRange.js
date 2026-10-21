export function currentBillingWeekRange() {
  const today = new Date()
  const startOfWeek = new Date(today)
  const daysSinceMonday = (today.getDay() + 6) % 7
  startOfWeek.setDate(today.getDate() - daysSinceMonday)

  const toDateInputValue = (date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')

    return `${year}-${month}-${day}`
  }

  return {
    date_from: toDateInputValue(startOfWeek),
    date_to: toDateInputValue(today),
  }
}
