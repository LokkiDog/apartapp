export type PwaInstallVariant = 'android' | 'ios' | null

export type PwaInstallContext = {
  userAgent: string
  platform: string
  maxTouchPoints: number
  isInstalled: boolean
  hasNativePrompt: boolean
  dismissed: boolean
}

export function isIosDevice({ userAgent, platform, maxTouchPoints }: Pick<PwaInstallContext, 'userAgent' | 'platform' | 'maxTouchPoints'>) {
  return /iPad|iPhone|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1)
}

export function isMobileDevice({ userAgent, platform, maxTouchPoints }: Pick<PwaInstallContext, 'userAgent' | 'platform' | 'maxTouchPoints'>) {
  return /Android|iPad|iPhone|iPod|Mobile/i.test(userAgent) || isIosDevice({ userAgent, platform, maxTouchPoints })
}

export function getPwaInstallVariant(context: PwaInstallContext): PwaInstallVariant {
  if (context.isInstalled || context.dismissed || !isMobileDevice(context)) return null
  if (isIosDevice(context)) return 'ios'
  return context.hasNativePrompt ? 'android' : null
}
