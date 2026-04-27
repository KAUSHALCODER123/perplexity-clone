import React from 'react';
import './SourceCard.css';

interface SourceProps {
  title: string;
  url: string;
}

export const SourceCard: React.FC<SourceProps> = ({ title, url }) => {
  // Extract domain name for a cleaner look
  const getDomain = (urlStr: string) => {
    try {
      return new URL(urlStr).hostname.replace('www.', '');
    } catch {
      return urlStr;
    }
  };

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="source-card">
      <div className="source-title" title={title}>{title}</div>
      <div className="source-domain">{getDomain(url)}</div>
    </a>
  );
};
