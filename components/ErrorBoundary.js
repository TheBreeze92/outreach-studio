"use client";
import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false };
  }

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error, info) {
    fetch("/api/report-client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error?.message ?? String(error),
        stack: info?.componentStack ?? error?.stack ?? "",
      }),
    }).catch(() => {});
  }

  render() {
    if (this.state.crashed) {
      return (
        <div style={{ padding: 40, textAlign: "center", fontFamily: "sans-serif" }}>
          <p style={{ fontSize: 16, fontWeight: 700 }}>Something went wrong.</p>
          <p style={{ fontSize: 14, color: "#666" }}>
            We&apos;ve been notified and will look into it. Please refresh the page to try again.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
