import { Component } from "solid-js";
import type { View } from "../App";
import "./Header.css";

interface HeaderProps {
  currentView: View;
  onNavigate: (view: View) => void;
}

const Header: Component<HeaderProps> = (props) => {
  const navItems: { view: View; label: string }[] = [
    { view: "search", label: "Search" },
    { view: "installed", label: "Installed" },
    { view: "settings", label: "Settings" },
  ];

  return (
    <header class="header">
      <div class="title">
        <h1>Rscoop</h1>
      </div>
      <nav class="nav">
        {navItems.map((item) => (
          <button
            class="nav-button"
            classList={{ active: props.currentView === item.view }}
            onClick={() => props.onNavigate(item.view)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </header>
  );
};

export default Header; 