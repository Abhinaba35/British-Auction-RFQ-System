import React from 'react';

const STATUS_CONFIG = {
  active: { label: 'Live', dot: 'bg-emerald-400 animate-pulse', cls: 'status-active' },
  closed: { label: 'Closed', dot: 'bg-white/40', cls: 'status-closed' },
  force_closed: { label: 'Force Closed', dot: 'bg-red-400', cls: 'status-force_closed' },
  draft: { label: 'Draft', dot: 'bg-blue-400', cls: 'status-draft' },
};

const StatusBadge = ({ status }) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span className={config.cls}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
};

export default StatusBadge;
