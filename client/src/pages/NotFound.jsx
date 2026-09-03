import { Link } from 'react-router-dom';
import Page from '../components/Page.jsx';

export default function NotFound() {
  return (
    <Page title="Page not found">
      <p>
        That address does not match any page. <Link to="/">Go to the dashboard</Link>.
      </p>
    </Page>
  );
}
