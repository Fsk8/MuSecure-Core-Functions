import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProviderWrapper } from "@/components/Privyproviderwrapper";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PrivyProviderWrapper>
      <App />
    </PrivyProviderWrapper>
  </StrictMode>
);
