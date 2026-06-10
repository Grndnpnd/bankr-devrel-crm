'use client';
import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, UserPlus, X, ChevronDown, UserX, Shield } from 'lucide-react';
import DataCard from '@/components/DataCard';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type UserRole = 'Admin' | 'DevRel' | 'Viewer';
type UserStatus = 'Active' | 'Invited' | 'Inactive';

interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  lastActive: string;
  initials: string;
  color: string;
}

/* ------------------------------------------------------------------ */
/*  Mock Data                                                          */
/* ------------------------------------------------------------------ */
const initialUsers: TeamUser[] = [
  {
    id: '1',
    name: 'James Chen',
    email: 'james@bankr.io',
    role: 'Admin',
    status: 'Active',
    lastActive: 'Just now',
    initials: 'JC',
    color: '#F5A623',
  },
  {
    id: '2',
    name: 'Sarah Miller',
    email: 'sarah@bankr.io',
    role: 'DevRel',
    status: 'Active',
    lastActive: '2 hours ago',
    initials: 'SM',
    color: '#3B82F6',
  },
  {
    id: '3',
    name: 'Mike Johnson',
    email: 'mike@bankr.io',
    role: 'DevRel',
    status: 'Active',
    lastActive: '1 day ago',
    initials: 'MJ',
    color: '#10B981',
  },
];

const roleDescriptions: Record<UserRole, string> = {
  Admin: 'Full access — manage users, scoring, sources',
  DevRel: 'Can view, edit, and manage outreach',
  Viewer: 'Read-only dashboard access',
};

const roleBadgeStyles: Record<UserRole, { bg: string; text: string }> = {
  Admin: { bg: 'rgba(245,166,35,0.15)', text: '#F5A623' },
  DevRel: { bg: 'rgba(59,130,246,0.15)', text: '#3B82F6' },
  Viewer: { bg: 'rgba(82,82,82,0.25)', text: '#8A8A8A' },
};

const statusDotColor: Record<UserStatus, string> = {
  Active: '#10B981',
  Invited: '#F5A623',
  Inactive: '#525252',
};

/* ------------------------------------------------------------------ */
/*  Invite Modal                                                       */
/* ------------------------------------------------------------------ */
interface InviteModalProps {
  open: boolean;
  onClose: () => void;
  onInvite: (email: string, role: UserRole) => void;
}

const InviteModal: React.FC<InviteModalProps> = ({ open, onClose, onInvite }) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('DevRel');
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);

  const handleSubmit = useCallback(() => {
    if (!email.trim()) return;
    onInvite(email.trim(), role);
    setEmail('');
    setRole('DevRel');
    onClose();
  }, [email, role, onInvite, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onClick={onClose}
          />
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
            className="fixed z-50"
            style={{
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '100%',
              maxWidth: '480px',
              backgroundColor: '#1A1A1A',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '12px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.08)',
              padding: '24px',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h3
                style={{
                  fontFamily: "'Manrope', sans-serif",
                  fontSize: '18px',
                  fontWeight: 700,
                  color: '#F0F0F0',
                }}
              >
                Invite Team Member
              </h3>
              <button
                onClick={onClose}
                className="flex items-center justify-center w-8 h-8 rounded-md transition-colors duration-150"
                style={{ color: '#525252' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#222222';
                  e.currentTarget.style.color = '#F0F0F0';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = '#525252';
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <div className="flex flex-col gap-4">
              {/* Email input */}
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#525252', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                  Email Address
                </label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#525252' }} />
                  <input
                    type="email"
                    placeholder="colleague@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-md outline-none transition-all duration-150"
                    style={{
                      height: '36px',
                      backgroundColor: '#141414',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#F0F0F0',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '13px',
                      padding: '0 12px 0 36px',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#F5A623';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(245,166,35,0.15)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>
              </div>

              {/* Role select */}
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#525252', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                  Role
                </label>
                <div className="relative">
                  <button
                    onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
                    className="w-full flex items-center justify-between rounded-md outline-none transition-all duration-150"
                    style={{
                      height: '36px',
                      backgroundColor: '#141414',
                      border: roleDropdownOpen ? '1px solid #F5A623' : '1px solid rgba(255,255,255,0.1)',
                      color: '#F0F0F0',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '13px',
                      padding: '0 12px',
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block w-2 h-2 rounded-full"
                        style={{ backgroundColor: roleBadgeStyles[role].text }}
                      />
                      {role}
                    </span>
                    <ChevronDown size={14} style={{ color: '#525252', transform: roleDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                  </button>
                  <AnimatePresence>
                    {roleDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setRoleDropdownOpen(false)} />
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.1 }}
                          className="absolute z-20 w-full mt-1"
                          style={{
                            backgroundColor: '#1A1A1A',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: '8px',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 0 1px rgba(255,255,255,0.06)',
                            overflow: 'hidden',
                          }}
                        >
                          {(['Admin', 'DevRel', 'Viewer'] as UserRole[]).map((r) => (
                            <button
                              key={r}
                              onClick={() => {
                                setRole(r);
                                setRoleDropdownOpen(false);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors duration-100"
                              style={{
                                backgroundColor: r === role ? 'rgba(245,166,35,0.1)' : 'transparent',
                              }}
                              onMouseEnter={(e) => {
                                if (r !== role) e.currentTarget.style.backgroundColor = '#222222';
                              }}
                              onMouseLeave={(e) => {
                                if (r !== role) e.currentTarget.style.backgroundColor = 'transparent';
                              }}
                            >
                              <span
                                className="block w-2 h-2 rounded-full"
                                style={{ backgroundColor: roleBadgeStyles[r].text }}
                              />
                              <div>
                                <div style={{ fontSize: '13px', color: r === role ? '#F5A623' : '#F0F0F0', fontWeight: 500 }}>
                                  {r}
                                </div>
                                <div style={{ fontSize: '11px', color: '#525252' }}>
                                  {roleDescriptions[r]}
                                </div>
                              </div>
                            </button>
                          ))}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Submit */}
              <div className="flex justify-end gap-2 mt-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-md transition-all duration-150"
                  style={{
                    backgroundColor: 'transparent',
                    color: '#8A8A8A',
                    border: '1px solid rgba(255,255,255,0.1)',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#222222';
                    e.currentTarget.style.color = '#F0F0F0';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#8A8A8A';
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!email.trim()}
                  className="px-4 py-2 rounded-md transition-all duration-150"
                  style={{
                    backgroundColor: email.trim() ? '#F5A623' : '#2A2A2A',
                    color: email.trim() ? '#0D0D0D' : '#525252',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: email.trim() ? 'pointer' : 'not-allowed',
                    opacity: email.trim() ? 1 : 0.5,
                  }}
                  onMouseEnter={(e) => {
                    if (email.trim()) {
                      e.currentTarget.style.backgroundColor = '#E8941A';
                      e.currentTarget.style.boxShadow = '0 0 20px rgba(245,166,35,0.15)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (email.trim()) {
                      e.currentTarget.style.backgroundColor = '#F5A623';
                      e.currentTarget.style.boxShadow = 'none';
                    }
                  }}
                >
                  Send Invite
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

/* ------------------------------------------------------------------ */
/*  Users Tab                                                          */
/* ------------------------------------------------------------------ */
const UsersTab: React.FC = () => {
  const [users, setUsers] = useState<TeamUser[]>(initialUsers);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<string | null>(null);

  const handleRoleChange = useCallback((userId: string, newRole: UserRole) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
    );
    setEditingRole(null);
  }, []);

  const handleRemove = useCallback((userId: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== userId));
  }, []);

  const handleInvite = useCallback((email: string, role: UserRole) => {
    const name = email.split('@')[0];
    const initials = name.slice(0, 2).toUpperCase();
    const newUser: TeamUser = {
      id: Date.now().toString(),
      name: name.charAt(0).toUpperCase() + name.slice(1),
      email,
      role,
      status: 'Invited',
      lastActive: '-',
      initials,
      color: '#8A8A8A',
    };
    setUsers((prev) => [...prev, newUser]);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {/* User Table */}
      <DataCard
        title={`Team Members (${users.length})`}
        delay={0}
        style={{ overflow: 'visible' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                {['User', 'Role', 'Status', 'Last Active', 'Actions'].map((h) => (
                  <th
                    key={h}
                    className="text-left py-2 px-3"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '11px',
                      fontWeight: 600,
                      color: '#525252',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((user, i) => (
                <motion.tr
                  key={user.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.25,
                    delay: i * 0.05,
                    ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
                  }}
                  className="transition-colors duration-150"
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    backgroundColor: i % 2 === 0 ? '#141414' : '#1A1A1A',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#222222';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = i % 2 === 0 ? '#141414' : '#1A1A1A';
                  }}
                >
                  {/* User cell */}
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex items-center justify-center rounded-full"
                        style={{
                          width: '28px',
                          height: '28px',
                          backgroundColor: user.color + '22',
                          color: user.color,
                          fontSize: '11px',
                          fontWeight: 700,
                          fontFamily: "'Inter', sans-serif",
                          flexShrink: 0,
                        }}
                      >
                        {user.initials}
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#F0F0F0' }}>
                          {user.name}
                        </div>
                        <div style={{ fontSize: '11px', color: '#525252' }}>{user.email}</div>
                      </div>
                    </div>
                  </td>

                  {/* Role cell */}
                  <td className="py-3 px-3">
                    <div className="relative">
                      <button
                        onClick={() => setEditingRole(editingRole === user.id ? null : user.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all duration-150"
                        style={{
                          backgroundColor: roleBadgeStyles[user.role].bg,
                          color: roleBadgeStyles[user.role].text,
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {user.role}
                        <ChevronDown size={12} />
                      </button>
                      <AnimatePresence>
                        {editingRole === user.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setEditingRole(null)} />
                            <motion.div
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: 0.1 }}
                              className="absolute z-20 mt-1"
                              style={{
                                backgroundColor: '#1A1A1A',
                                border: '1px solid rgba(255,255,255,0.06)',
                                borderRadius: '8px',
                                boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                                overflow: 'hidden',
                                minWidth: '140px',
                              }}
                            >
                              {(['Admin', 'DevRel', 'Viewer'] as UserRole[]).map((r) => (
                                <button
                                  key={r}
                                  onClick={() => handleRoleChange(user.id, r)}
                                  className="w-full text-left px-3 py-2 transition-colors duration-100"
                                  style={{
                                    fontSize: '12px',
                                    color: r === user.role ? '#F5A623' : '#F0F0F0',
                                    backgroundColor: r === user.role ? 'rgba(245,166,35,0.1)' : 'transparent',
                                    fontWeight: r === user.role ? 600 : 400,
                                  }}
                                  onMouseEnter={(e) => {
                                    if (r !== user.role) e.currentTarget.style.backgroundColor = '#222222';
                                  }}
                                  onMouseLeave={(e) => {
                                    if (r !== user.role) e.currentTarget.style.backgroundColor = 'transparent';
                                  }}
                                >
                                  {r}
                                </button>
                              ))}
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>
                  </td>

                  {/* Status cell */}
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="block rounded-full"
                        style={{
                          width: '8px',
                          height: '8px',
                          backgroundColor: statusDotColor[user.status],
                          boxShadow: user.status === 'Active' ? '0 0 8px rgba(16,185,129,0.4)' : undefined,
                        }}
                      />
                      <span style={{ fontSize: '12px', color: '#8A8A8A' }}>{user.status}</span>
                    </div>
                  </td>

                  {/* Last active */}
                  <td className="py-3 px-3" style={{ fontSize: '12px', color: '#8A8A8A' }}>
                    {user.lastActive}
                  </td>

                  {/* Actions */}
                  <td className="py-3 px-3">
                    <button
                      onClick={() => handleRemove(user.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md transition-all duration-150"
                      style={{
                        backgroundColor: 'transparent',
                        color: '#EF4444',
                        border: '1px solid rgba(239,68,68,0.2)',
                        fontSize: '11px',
                        fontWeight: 500,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <UserX size={12} />
                      Remove
                    </button>
                  </td>
                </motion.tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center" style={{ color: '#525252', fontSize: '13px' }}>
                    No team members yet. Invite someone to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DataCard>

      {/* Invite Section */}
      <DataCard title="Invite Team Member" delay={0.08}>
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={() => setInviteOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md transition-all duration-150"
            style={{
              backgroundColor: '#F5A623',
              color: '#0D0D0D',
              fontFamily: "'Inter', sans-serif",
              fontSize: '13px',
              fontWeight: 600,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#E8941A';
              e.currentTarget.style.boxShadow = '0 0 20px rgba(245,166,35,0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#F5A623';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <UserPlus size={16} />
            Invite User
          </button>
          <div className="flex items-center gap-2" style={{ color: '#525252', fontSize: '12px' }}>
            <Shield size={14} />
            <span>Only Admins can manage users and scoring weights</span>
          </div>
        </div>
      </DataCard>

      {/* Invite Modal */}
      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} onInvite={handleInvite} />
    </div>
  );
};

export default UsersTab;
