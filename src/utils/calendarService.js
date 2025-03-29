// Google Calendar API service
class CalendarService {
  constructor() {
    this.baseUrl = "https://www.googleapis.com/calendar/v3";
    this.isInitialized = false;
  }

  // Check if the token is expired and needs refresh
  async checkAndRefreshToken() {
    const expiryTime = localStorage.getItem("google_token_expiry");

    // If token is expired or will expire in the next 5 minutes
    if (expiryTime && new Date().getTime() > parseInt(expiryTime) - 300000) {
      return this.refreshAccessToken();
    }

    return Promise.resolve(localStorage.getItem("google_access_token"));
  }

  // Refresh the access token using the refresh token
  async refreshAccessToken() {
    try {
      const refreshToken = localStorage.getItem("google_refresh_token");

      if (!refreshToken) {
        throw new Error("No refresh token available");
      }

      const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
      const clientSecret = process.env.REACT_APP_GOOGLE_CLIENT_SECRET;

      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Token refresh failed: ${errorData.error}`);
      }

      const data = await response.json();

      // Update the stored access token and expiry time
      localStorage.setItem("google_access_token", data.access_token);
      localStorage.setItem(
        "google_token_expiry",
        new Date().getTime() + data.expires_in * 1000
      );

      return data.access_token;
    } catch (error) {
      console.error("Error refreshing token:", error);
      // If refresh fails, we need to re-authenticate
      localStorage.removeItem("google_access_token");
      localStorage.removeItem("google_refresh_token");
      localStorage.removeItem("google_token_expiry");
      localStorage.removeItem("google_user_email");
      localStorage.removeItem("google_user_name");

      // Redirect to auth page after a short delay
      setTimeout(() => {
        window.location.href = "/";
      }, 1000);

      throw error;
    }
  }

  // Make a request to the Google Calendar API
  async makeRequest(endpoint, options = {}) {
    try {
      const accessToken = await this.checkAndRefreshToken();

      if (!accessToken) {
        throw new Error("No access token available");
      }

      const url = `${this.baseUrl}${endpoint}`;

      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": options.body
            ? "application/json"
            : options.headers?.["Content-Type"],
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `API request failed: ${
            errorData.error?.message || JSON.stringify(errorData)
          }`
        );
      }

      // For DELETE requests or empty responses (204 No Content), return true
      if (response.status === 204 || options.method === "DELETE") {
        return true;
      }

      return response.json();
    } catch (error) {
      console.error("API request error:", error);

      // Handle authentication errors
      if (
        error.message.includes("invalid_grant") ||
        error.message.includes("invalid_token") ||
        error.message.includes("401")
      ) {
        // Clear tokens and redirect to login
        localStorage.removeItem("google_access_token");
        localStorage.removeItem("google_refresh_token");
        localStorage.removeItem("google_token_expiry");

        // Redirect to auth page after a short delay
        setTimeout(() => {
          window.location.href = "/";
        }, 1000);
      }

      throw error;
    }
  }

  // --- CRUD Operations ---

  // List calendars
  async listCalendars() {
    return this.makeRequest("/users/me/calendarList");
  }

  // List events from a calendar
  async listEvents(
    calendarId = "primary",
    timeMin = new Date().toISOString(),
    maxResults = 10
  ) {
    const queryParams = new URLSearchParams({
      timeMin,
      maxResults,
      singleEvents: true,
      orderBy: "startTime",
    });

    return this.makeRequest(`/calendars/${calendarId}/events?${queryParams}`);
  }

  // Get a single event
  async getEvent(calendarId = "primary", eventId) {
    return this.makeRequest(`/calendars/${calendarId}/events/${eventId}`);
  }

  // Create a new event
  async createEvent(calendarId = "primary", eventData) {
    return this.makeRequest(`/calendars/${calendarId}/events`, {
      method: "POST",
      body: JSON.stringify(eventData),
    });
  }

  // Update an existing event
  async updateEvent(calendarId = "primary", eventId, eventData) {
    return this.makeRequest(`/calendars/${calendarId}/events/${eventId}`, {
      method: "PUT",
      body: JSON.stringify(eventData),
    });
  }

  // Delete an event
  async deleteEvent(calendarId = "primary", eventId) {
    return this.makeRequest(`/calendars/${calendarId}/events/${eventId}`, {
      method: "DELETE",
    });
  }

  // Helper method to check if user is authenticated
  isAuthenticated() {
    return !!localStorage.getItem("google_access_token");
  }

  // Helper method to get user information
  getUserInfo() {
    return {
      email: localStorage.getItem("google_user_email"),
      name: localStorage.getItem("google_user_name"),
    };
  }

  // Helper to format event for creation
  formatEvent(title, description, start, end, attendees = []) {
    try {
      // Ensure valid dates
      const startDate = new Date(start);
      const endDate = new Date(end);

      // Verify dates are valid
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error("Invalid date format provided");
      }

      return {
        summary: title,
        description,
        start: {
          dateTime: startDate.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        attendees: attendees.map((email) => ({ email })),
      };
    } catch (error) {
      console.error("Error formatting event:", error, { title, start, end });
      throw new Error(`Failed to format event: ${error.message}`);
    }
  }
}

const calendarService = new CalendarService();
export default calendarService;
