// emailTemplates/WelcomeEmail.jsx
import React from "react";
import { Html, Head, Preview, Body, Container, Heading, Button, Text } from "@react-email/components";

const WelcomeEmail = () => (
  <Html>
    <Head />
    <Preview>Welcome to MarketMe! Let's get started.</Preview>
    <Body style={styles.body}>
      <Container style={styles.container}>
        <Heading style={styles.heading}>Welcome to MarketMe!</Heading>
        <Text style={styles.paragraph}>
          We are excited to have you on board. MarketMe will help you automate your marketing efforts and reach more customers.
        </Text>
        <Button style={styles.button} href="https://marketme.com/get-started">
          Get Started
        </Button>
      </Container>
    </Body>
  </Html>
);

const styles = {
  body: {
    backgroundColor: "#f4f4f4",
    padding: "20px",
    fontFamily: "Arial, sans-serif",
  },
  container: {
    backgroundColor: "#ffffff",
    padding: "20px",
    borderRadius: "8px",
    boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
    maxWidth: "600px",
    margin: "0 auto",
  },
  heading: {
    color: "#333333",
    fontSize: "24px",
    marginBottom: "20px",
  },
  paragraph: {
    color: "#555555",
    fontSize: "16px",
    lineHeight: "24px",
  },
  button: {
    backgroundColor: "#4CAF50",
    color: "#ffffff",
    padding: "12px 24px",
    textDecoration: "none",
    borderRadius: "5px",
    transition: "background-color 0.3s ease",
    textAlign: "center",
    display: "inline-block",
  },
};

export default WelcomeEmail;
