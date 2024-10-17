import React from 'react';
import { createRoot } from 'react-dom/client';
import '../tailwind.css';

function Colors() {
  return (
    <main>
      <h2>Primary color</h2>
      <div className="row">
        <div className="example2">
          <div className="h-16 w-16 rounded bg-primary"></div>
        </div>
        <div className="example2">
          <div className="h-16 w-16 rounded bg-primary/80"></div>
        </div>
        <div className="example2">
          <div className="h-16 w-16 rounded bg-primary/60"></div>
        </div>
        <div className="example2">
          <div className="h-16 w-16 rounded bg-primary/40"></div>
        </div>
        <div className="example2">
          <div className="h-16 w-16 rounded bg-primary/20"></div>
        </div>
        <div className="example2">
          <div className="bg-infosecondary h-16 w-16 rounded"></div>
        </div>
        <div className="example2">
          <div className="bg-highlight h-16 w-16 rounded"></div>
        </div>
        <div className="example2">
          <div className="bg-highlight h-16 w-16 rounded"></div>
        </div>
        <div className="example2">
          <div className="h-16 w-16 rounded bg-white"></div>
        </div>
        <div className="example2">
          <div className="h-16 w-16 rounded bg-white"></div>
        </div>
        <div className="example2">
          <div className="h-16 w-16 rounded bg-white"></div>
        </div>
      </div>

      <h2>New colors</h2>
      <div className="row">
        <div className="example2">
          <div className="bg-highlight h-16 w-16 rounded"></div>
        </div>
        <div className="example2">
          <div className="bg-bkg-low h-16 w-16 rounded"></div>
        </div>
        <div className="example2">
          <div className="bg-bkg-med h-16 w-16 rounded"></div>
        </div>
        <div className="example2">
          <div className="bg-bkg-full h-16 w-16 rounded"></div>
        </div>
      </div>

      <h2>Core colors</h2>
      <div className="row">
        <div className="example2">
          <div className="h-16 w-16 rounded bg-background"></div>
        </div>
        <div className="example2">
          <div className="h-16 w-16 rounded bg-foreground"></div>
        </div>
        <div className="example2">
          <div className="h-16 w-16 rounded bg-card"></div>
        </div>
        <div className="example2">
          <div className="h-16 w-16 rounded bg-card-foreground"></div>
        </div>
        <div className="example2">
          <div className="h-16 w-16 rounded bg-popover"></div>
        </div>
        <div className="example2">
          <div className="h-16 w-16 rounded bg-popover-foreground"></div>
        </div>
        <div className="example2">
          <div className="h-16 w-16 rounded bg-primary"></div>
        </div>
        <div className="example2">
          <div className="h-16 w-16 rounded bg-primary-foreground"></div>
        </div>
        <div className="example2">
          <div className="h-16 w-16 rounded bg-secondary"></div>
        </div>
        <div className="example2">
          <div className="h-16 w-16 rounded bg-secondary-foreground"></div>
        </div>
        <div className="example2">
          <div className="h-16 w-16 rounded bg-muted"></div>
        </div>
        <div className="example2">
          <div className="h-16 w-16 rounded bg-muted-foreground"></div>
        </div>
        <div className="example2">
          <div className="h-16 w-16 rounded bg-accent"></div>
        </div>
        <div className="example2">
          <div className="h-16 w-16 rounded bg-accent-foreground"></div>
        </div>
        <div className="example2">
          <div className="destructive h-16 w-16 rounded"></div>
        </div>
        <div className="example2">
          <div className="destructive-foreground h-16 w-16 rounded"></div>
        </div>
        <div className="example2">
          <div className="h-16 w-16 rounded bg-border"></div>
        </div>
      </div>

      <h2>Borders</h2>
      <div className="row">
        <div className="example2">
          <div className="h-16 w-16 rounded bg-border"></div>
        </div>
        <div className="example2">
          <div className="h-16 w-16 rounded bg-input"></div>
        </div>
        <div className="example2">
          <div className="h-16 w-16 rounded bg-ring"></div>
        </div>
      </div>
    </main>
  );
}

const container = document.getElementById('root');
const root = createRoot(container);
root.render(React.createElement(Colors));
