import React from 'react';
import './SourceCard.css';

interface SourceProps {
  id: string;
  index: number;
  title: string;
  url: string;
}

const getDomain = (urlStr: string) => {
  try {
    return new URL(urlStr).hostname.replace(/^www\./, '');
  } catch {
    return urlStr;
  }
};

export const SourceCard: React.FC<SourceProps> = ({ id, index, title, url }) => {
  const domain = getDomain(url);

  return (
    <a
      id={id}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="source-card"
      title={title || url}
    >
      <div className="source-head">
        <span className="source-index">{index}</span>
        <span className="source-domain">{domain}</span>
      </div>
      <div className="source-title">{title || domain}</div>
    </a>
  );
};
