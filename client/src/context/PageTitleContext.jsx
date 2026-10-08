import { createContext, useContext, useEffect, useState } from 'react';

const PageTitleContext = createContext(null);

export function PageTitleProvider({ children }) {
  const [title, setTitle] = useState('');
  return <PageTitleContext.Provider value={{ title, setTitle }}>{children}</PageTitleContext.Provider>;
}

export function usePageTitleValue() {
  return useContext(PageTitleContext);
}

// Pages call this to override the default route-based app-bar title once
// they know something more specific, e.g. the product's own name.
export function usePageTitle(title) {
  const ctx = useContext(PageTitleContext);
  useEffect(() => {
    if (title) ctx.setTitle(title);
  }, [title]); // eslint-disable-line react-hooks/exhaustive-deps
}
