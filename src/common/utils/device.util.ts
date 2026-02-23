import { Request } from 'express';

export interface DeviceInfo {
  ipAddress: string;
  userAgent: string;
  deviceName: string;
  deviceType: string;
}

export class DeviceUtil {
  static extractDeviceInfo(req: Request): DeviceInfo {
    const ipAddress = this.getIpAddress(req);
    const userAgent = req.headers['user-agent'] || 'Unknown';

    const deviceType = this.getDeviceType(userAgent);
    const deviceName = this.getDeviceName(userAgent, deviceType);

    return {
      ipAddress,
      userAgent,
      deviceName,
      deviceType,
    };
  }

  private static getIpAddress(req: Request): string {
    // Check for IP in various headers (for proxied requests)
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = (forwarded as string).split(',');

      return ips[0].trim();
    }

    return (req.headers['x-real-ip'] as string) || req.socket.remoteAddress || 'Unknown';
  }

  private static getDeviceType(userAgent: string): string {
    const ua = userAgent.toLowerCase();

    // Mobile detection
    const mobileKeywords = [
      'ipad',
      'ipod',
      'webos',
      'iphone',
      'mobile',
      'android',
      'blackberry',
      'windows phone',
    ];
    if (mobileKeywords.some((keyword) => ua.includes(keyword))) return 'mobile';

    // Desktop apps detection (Electron, etc.)
    if (ua.includes('electron') || ua.includes('desktop')) return 'desktop';

    // Default to web
    return 'web';
  }

  private static getDeviceName(userAgent: string, deviceType: string): string {
    const ua = userAgent.toLowerCase();

    // iOS devices
    if (ua.includes('ipad')) return 'iPad';
    if (ua.includes('ipod')) return 'iPod';
    if (ua.includes('iphone')) return 'iPhone';

    // Android
    if (ua.includes('android')) {
      // Try to extract device model
      const androidMatch = userAgent.match(/Android.*?;\s*([^)]+)/);

      if (androidMatch && androidMatch[1]) return androidMatch[1].trim();

      return 'Android Device';
    }

    // Desktop OS
    if (ua.includes('linux')) return 'Linux PC';
    if (ua.includes('windows')) return 'Windows PC';
    if (ua.includes('macintosh') || ua.includes('mac os x')) return 'Mac';

    // Browsers
    if (ua.includes('edge')) return 'Edge Browser';
    if (ua.includes('firefox')) return 'Firefox Browser';
    if (ua.includes('chrome') && !ua.includes('edge')) return 'Chrome Browser';
    if (ua.includes('safari') && !ua.includes('chrome')) return 'Safari Browser';

    // Fallback to generic name based on device type when specific device/browser cannot be detected
    return deviceType === 'mobile'
      ? 'Mobile Device'
      : deviceType === 'desktop'
        ? 'Desktop App'
        : 'Web Browser';
  }
}
