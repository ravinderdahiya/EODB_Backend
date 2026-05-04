import ua from 'universal-analytics';

// Google Analytics service for server-side tracking
class AnalyticsService {
  constructor() {
    this.measurementId = process.env.GA_MEASUREMENT_ID;
    this.enabled = !!this.measurementId && this.measurementId !== 'GA_MEASUREMENT_ID';

    if (this.enabled) {
      console.log('Server-side Google Analytics initialized with ID:', this.measurementId);
    } else {
      console.warn('Server-side Google Analytics not initialized - measurement ID not provided');
    }
  }

  // Create a visitor instance for tracking
  createVisitor(clientId = null) {
    if (!this.enabled) return null;

    return ua(this.measurementId, clientId || 'server-user', {
      strictCidFormat: false,
      https: true
    });
  }

  // Track page views (API endpoints)
  trackPageView(path, title, userId = null, clientId = null) {
    if (!this.enabled) return;

    const visitor = this.createVisitor(clientId);
    if (!visitor) return;

    visitor.pageview({
      dp: path,
      dt: title,
      uid: userId
    }).send();

    console.log(`GA Pageview: ${path} - ${title}`);
  }

  // Track events
  trackEvent(category, action, label = null, value = null, userId = null, clientId = null) {
    if (!this.enabled) return;

    const visitor = this.createVisitor(clientId);
    if (!visitor) return;

    const eventData = {
      ec: category,
      ea: action,
      uid: userId
    };

    if (label) eventData.el = label;
    if (value) eventData.ev = value;

    visitor.event(eventData).send();

    console.log(`GA Event: ${category} - ${action} - ${label || ''}`);
  }

  // Track API usage
  trackApiUsage(endpoint, method, statusCode, userId = null, clientId = null) {
    this.trackEvent('api_usage', `${method}_${endpoint}`, `status_${statusCode}`, null, userId, clientId);
  }

  // Track user authentication events
  trackAuthEvent(eventType, userId = null, clientId = null, additionalData = {}) {
    const label = additionalData.mobile ? `mobile_${additionalData.mobile}` : null;
    this.trackEvent('authentication', eventType, label, null, userId, clientId);
  }

  // Track errors
  trackError(errorType, errorMessage, userId = null, clientId = null) {
    this.trackEvent('error', errorType, errorMessage, null, userId, clientId);
  }

  // Track performance metrics
  trackPerformance(metric, value, userId = null, clientId = null) {
    this.trackEvent('performance', metric, null, value, userId, clientId);
  }

  // Track location-based events
  trackLocationEvent(eventType, locationData, userId = null, clientId = null) {
    const label = locationData.city ? `${locationData.city}, ${locationData.country || ''}` : null;
    this.trackEvent('location', eventType, label, null, userId, clientId);
  }

  // Track OTP events
  trackOtpEvent(eventType, phone = null, userId = null, clientId = null) {
    const label = phone ? `phone_${phone.slice(-4)}` : null; // Only last 4 digits for privacy
    this.trackEvent('otp', eventType, label, null, userId, clientId);
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();
export default analyticsService;