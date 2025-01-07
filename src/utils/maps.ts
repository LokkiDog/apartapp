let googleMapsLoaded = false

export const loadGoogleMapsAPI = (apiKey: string): Promise<void> => {
    if (googleMapsLoaded) {
        return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`
        script.async = true
        script.defer = true

        script.addEventListener('load', () => {
            googleMapsLoaded = true
            resolve()
        })

        script.addEventListener('error', () => {
            reject(new Error('Google Maps failed to load'))
        })

        document.head.appendChild(script)
    })
}
