import type { ReactElement } from 'react';

type OAuth2RedirectProps = {
	provider?: string
}

export default function OAuth2Redirect({
	provider,
}: OAuth2RedirectProps): ReactElement {
  return <div>
  	<br />
  	<p>
	The OAuth2 Redirect URI is the location where the provider will redirect to after trying to login. This needs to set to your Publica <code className = "nextra-code">FRONTEND_URL</code> + <code className = "nextra-code">/integrations/social/</code> + <code className = "nextra-code">{provider}</code>.
	</p>

	<ul className = "[:is(ol,ul)_&]:_my-3 [&:not(:first-child)]:_mt-6 _list-disc ltr:_ml-6 rtl:_mr-6">
		<li>eg: If you are running on a container, and your Publica URL is: <code className = "nextra-code">https://Publica.example.com</code>, then your OAuth2 Redirect URI is <code className = "nextra-code">https://Publica.example.com/integrations/social/{provider}</code></li>
		<li>eg: If you are running on localhost, and your Publica URL is <code className = "nextra-code">http://localhost:4200</code>, then your OAuth2 Redirect URI is <code className = "nextra-code">http://localhost:4200/integrations/social/{provider}</code></li>
	</ul>

	<br />

	<p>
	You only need to set one OAuth2 Redirect URI when you are setting up your Publica app.
	</p>
  </div>;
}
