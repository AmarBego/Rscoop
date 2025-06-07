/**
 * Creates a fuzzy search function for a list of items
 * @param getItems Function that returns the list of items to search
 * @param getSearchFields Function that returns the fields to search in for each item
 * @returns A function that performs fuzzy search on the items
 */
export function createFuzzySearch<T>(
  getItems: () => T[],
  getSearchFields: (item: T) => string[]
) {
  return (query: string): T[] => {
    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) return getItems();
    
    const queryParts = normalizedQuery.split(/\s+/);
    
    return getItems().filter((item) => {
      const fields = getSearchFields(item).map(field => 
        field ? field.toLowerCase() : ''
      );
      
      return queryParts.every(part => 
        fields.some(field => field.includes(part))
      );
    });
  };
} 