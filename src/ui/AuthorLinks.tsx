// The author's name with links to GitHub and LinkedIn (About, Welcome). Same line as in Quaera Model.

export const AUTHOR_GITHUB_URL = 'https://github.com/StanislavSidorovich'
export const AUTHOR_LINKEDIN_URL = 'https://www.linkedin.com/in/stanislavsidorovich'

export function AuthorLinks({ className = '' }: { className?: string }) {
  return (
    <p className={className} style={{ color: 'var(--muted)', fontSize: 12 }}>
      Made by Stanislav Sidorovich ·{' '}
      <a className="underline" href={AUTHOR_GITHUB_URL} target="_blank" rel="noopener noreferrer">
        GitHub
      </a>{' '}
      ·{' '}
      <a className="underline" href={AUTHOR_LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
        LinkedIn
      </a>
    </p>
  )
}
