import type { FastifyInstance } from 'fastify';
import {
  parseJoinPageQuery,
  renderInvalidJoinPageHtml,
  renderJoinPageHtml
} from '#/server/routes/joinPage.js';

/**
 * Registers the public HTML join landing page for Team Hub invitations.
 *
 * @param app - Fastify server or encapsulated public scope.
 */
export async function registerJoinRoute(app: FastifyInstance): Promise<void> {
  app.route({
    method: 'GET',
    url: '/join',
    /**
     * Renders a themed join page from non-secret invite query parameters.
     */
    handler: async (request, reply) => {
      const parsed = parseJoinPageQuery(request.query as Record<string, unknown>);
      const html = parsed ? renderJoinPageHtml(parsed) : renderInvalidJoinPageHtml();

      return reply
        .header('Cache-Control', 'no-store')
        .header('Referrer-Policy', 'no-referrer')
        .type('text/html; charset=utf-8')
        .send(html);
    }
  });
}
