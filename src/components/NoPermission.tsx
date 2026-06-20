import { useNavigate } from 'react-router-dom';

interface Props {
  backPath?: string;
  message?: string;
}

export function NoPermission({ backPath = '/', message }: Props) {
  const navigate = useNavigate();
  return (
    <>
      <div className="listing-actions">
        <button className="btn" onClick={() => navigate(backPath)}>Back</button>
      </div>
      <p className="empty" style={{ padding: 28 }}>
        {message ?? "You don't have permission to view this page."}
      </p>
    </>
  );
}
