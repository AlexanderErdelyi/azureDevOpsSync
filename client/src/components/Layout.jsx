import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Plug, 
  Settings, 
  Activity, 
  Clock, 
  Webhook, 
  Bell,
  AlertTriangle,
  Menu,
  X
} from 'lucide-react';
import './Layout.css';

const Layout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/connectors', icon: Plug, label: 'Connectors' },
    { path: '/sync-configs', icon: Settings, label: 'Sync Configs' },
    { path: '/monitoring', icon: Activity, label: 'Monitoring' },
    { path: '/scheduler', icon: Clock, label: 'Scheduler' },
    { path: '/webhooks', icon: Webhook, label: 'Webhooks' },
    { path: '/notifications', icon: Bell, label: 'Notifications' },
    { path: '/conflicts', icon: AlertTriangle, label: 'Conflicts' }
  ];

  return (
    <div className="layout">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <h1 className="sidebar-title">
            {sidebarOpen && 'Sync Platform'}
            {!sidebarOpen && 'SP'}
          </h1>
          <button 
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              title={!sidebarOpen ? item.label : undefined}
            >
              <item.icon size={20} />
              {sidebarOpen && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="version-info">
            {sidebarOpen && (
              <>
                <div className="version-label">Version 1.0.0</div>
                <div className="phase-label">Phase 7: Conflicts</div>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className={`main-content ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        {children}
      </main>
    </div>
  );
};

export default Layout;
