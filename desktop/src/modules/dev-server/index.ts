// codegraph: module dev-server
// codegraph: front door answers, isOnThisComputer

/** A repo's own dev server, the one a person starts with `npm run dev`,
 *  which the live view shows UI blocks from (ADR 0024). Codegraph never
 *  starts or stops it, and never reaches past this computer for one. */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Whether an address is a web page on this computer: http or https, on
 *  localhost or its loopback numbers, and nowhere else. */
export const isOnThisComputer = (address: string): boolean => {
  try {
    const url = new URL(address)
    return (url.protocol === 'http:' || url.protocol === 'https:') && LOCAL_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

/** Whether a dev server is answering at an address on this computer. Any
 *  answer counts, even "not found": something is running there. */
export const answers = async (address: string): Promise<boolean> => {
  if (!isOnThisComputer(address)) return false
  try {
    await fetch(address, { signal: AbortSignal.timeout(2000), redirect: 'manual' })
    return true
  } catch {
    return false
  }
}
