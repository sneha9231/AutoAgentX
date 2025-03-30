// Email Service using EmailJS directly from the package
import emailjs from '@emailjs/browser';

class EmailService {
  constructor() {
    this.isInitialized = false;
    this.emailConfig = {
      serviceId: localStorage.getItem('emailjs_service_id') || '',
      templateId: localStorage.getItem('emailjs_template_id') || '',
      userId: localStorage.getItem('emailjs_user_id') || ''
    };

    // Initialize if we have credentials
    if (this.isConfigured()) {
      this.initialize();
    }
  }

  // Initialize EmailJS with user ID
  initialize() {
    try {
      emailjs.init(this.emailConfig.userId);
      this.isInitialized = true;
      console.log('EmailJS initialized successfully');
    } catch (error) {
      console.error('Failed to initialize EmailJS:', error);
    }
  }

  // Initialize with credentials
  initializeWithCredentials(serviceId, templateId, userId) {
    this.emailConfig = {
      serviceId,
      templateId,
      userId
    };

    // Save to localStorage
    localStorage.setItem('emailjs_service_id', serviceId);
    localStorage.setItem('emailjs_template_id', templateId);
    localStorage.setItem('emailjs_user_id', userId);

    // Initialize EmailJS
    this.initialize();

    return this;
  }

  // Send an email
  async sendEmail(to, subject, text) {
    try {
      if (!this.isConfigured()) {
        throw new Error('Email service not configured properly. Please check your EmailJS credentials.');
      }

      // Initialize if not already done
      if (!this.isInitialized) {
        this.initialize();
      }

      // Log what we're about to send
      console.log('Sending email with:', {
        to_email: to,
        subject: subject,
        message: text,
        serviceId: this.emailConfig.serviceId,
        templateId: this.emailConfig.templateId
      });

      // Prepare template parameters
      const templateParams = {
        to_email: to,
        subject: subject,
        message: text,
        from_name: localStorage.getItem('emailjs_from_name') || 'AI Assistant',
        reply_to: localStorage.getItem('emailjs_reply_to') || to
      };

      // Send the email directly
      const response = await emailjs.send(
        this.emailConfig.serviceId,
        this.emailConfig.templateId,
        templateParams
      );

      console.log('Email sent successfully:', response);
      return {
        success: true,
        messageId: response.status.toString(),
        message: 'Email sent successfully!'
      };
    } catch (error) {
      console.error('Error sending email:', error);
      return {
        success: false,
        message: error.message || 'Unknown error occurred while sending email'
      };
    }
  }

  // Check if the service is properly configured
  isConfigured() {
    return !!(
      this.emailConfig.serviceId &&
      this.emailConfig.templateId &&
      this.emailConfig.userId
    );
  }
}

const emailService = new EmailService();
export default emailService;
