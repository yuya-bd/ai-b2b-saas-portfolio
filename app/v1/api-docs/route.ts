/**
 * Browsable API documentation.
 *
 * Served as a route handler rather than a page so the viewer stays out of the
 * React bundle. It reads the spec from /api/v1-docs at load time, which means
 * the docs cannot fall out of step with what that endpoint returns.
 */
export function GET() {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API documentation</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
    <script>
      window.onload = () => {
        window.SwaggerUIBundle({ url: "/api/v1-docs", dom_id: "#swagger-ui" });
      };
    </script>
  </body>
</html>`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
