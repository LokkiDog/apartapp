export const formatPrice = (price: number): string => {
    return new Intl.NumberFormat('ru-RU').format(price)
}

export const formatDate = (date: string): string => {
    return new Date(date).toLocaleDateString('ru-RU')
}
