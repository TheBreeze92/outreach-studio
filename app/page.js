"use client";
import ErrorBoundary from "../components/ErrorBoundary";
import App from "../components/App";

export default function Page() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
