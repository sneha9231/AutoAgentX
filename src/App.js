import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import {
  Container,
  CssBaseline,
  ThemeProvider,
  createTheme,
} from "@mui/material";
import GoogleAuth from "./components/GoogleAuth";
import AuthCallback from "./components/AuthCallback";
import CalendarView from "./components/CalendarView";
import ChatInterface from "./components/ChatInterface";
import calendarService from "./utils/calendarService";

// Create a custom theme
const theme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: "#1a1a1a",
      paper: "#2d2d2d",
    },
    primary: {
      main: "#90caf9",
    },
  },
});

// Protected route component
const ProtectedRoute = ({ children }) => {
  if (!calendarService.isAuthenticated()) {
    return <Navigate to="/calendar-auth" replace />;
  }

  return children;
};

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Routes>
          {/* Main chat interface - default route */}
          <Route
            path="/"
            element={
              <div
                style={{
                  height: "100vh",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <ChatInterface />
              </div>
            }
          />

          {/* Google Calendar Auth Pages */}
          <Route
            path="/calendar-auth"
            element={
              <Container>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: "100vh",
                    textAlign: "center",
                    padding: "20px",
                  }}
                >
                  <h1>Google Calendar Authentication</h1>
                  <p>
                    Connect to Google Calendar to enable scheduling through the
                    AI assistant.
                  </p>
                  <GoogleAuth />
                </div>
              </Container>
            }
          />

          {/* Auth callback route */}
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Calendar view (protected) */}
          <Route
            path="/calendar"
            element={
              <ProtectedRoute>
                <CalendarView />
              </ProtectedRoute>
            }
          />

          {/* Fallback route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
