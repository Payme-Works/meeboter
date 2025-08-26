/**
 * Brazilian real people names for bot display names
 * Mix of common first names and surnames from Brazil
 */
export const BRAZILIAN_MALE_NAMES = [
  'João Silva',
  'Pedro Santos',
  'Carlos Oliveira',
  'José Lima',
  'Antonio Costa',
  'Francisco Ferreira',
  'Marcos Rodrigues',
  'Paulo Almeida',
  'Lucas Pereira',
  'Gabriel Souza',
  'Rafael Barbosa',
  'Felipe Carvalho',
  'Bruno Nascimento',
  'Eduardo Ribeiro',
  'Rodrigo Martins',
  'Gustavo Araújo',
  'Leonardo Dias',
  'Daniel Fernandes',
  'Mateus Gomes',
  'André Cardoso',
  'Thiago Mendes',
  'Diego Rocha',
  'Vinicius Castro',
  'Fernando Moreira',
  'Ricardo Azevedo',
] as const;

export const BRAZILIAN_FEMALE_NAMES = [
  'Maria Silva',
  'Ana Santos',
  'Juliana Oliveira',
  'Fernanda Lima',
  'Patricia Costa',
  'Camila Ferreira',
  'Mariana Rodrigues',
  'Gabriela Almeida',
  'Beatriz Pereira',
  'Larissa Souza',
  'Bruna Barbosa',
  'Carolina Carvalho',
  'Amanda Nascimento',
  'Isabela Ribeiro',
  'Leticia Martins',
  'Natalia Araújo',
  'Priscila Dias',
  'Vanessa Fernandes',
  'Carla Gomes',
  'Renata Cardoso',
  'Tatiane Mendes',
  'Viviane Rocha',
  'Simone Castro',
  'Luciana Moreira',
  'Adriana Azevedo',
] as const;

export const ALL_BRAZILIAN_NAMES = [
  ...BRAZILIAN_MALE_NAMES,
  ...BRAZILIAN_FEMALE_NAMES,
] as const;

/**
 * Get a random Brazilian name from the available names
 */
export function getRandomBrazilianName(): string {
  const randomIndex = Math.floor(Math.random() * ALL_BRAZILIAN_NAMES.length);

  return ALL_BRAZILIAN_NAMES[randomIndex];
}

/**
 * Get multiple unique Brazilian names
 * @param count Number of names to return
 * @returns Array of unique Brazilian names
 */
export function getMultipleBrazilianNames(count: number): string[] {
  if (count <= 0) {
    return [];
  }

  if (count >= ALL_BRAZILIAN_NAMES.length) {
    return [...ALL_BRAZILIAN_NAMES];
  }

  const shuffled = [...ALL_BRAZILIAN_NAMES].sort(() => Math.random() - 0.5);

  return shuffled.slice(0, count);
}

/**
 * Get a Brazilian name by gender preference
 * @param gender 'male' | 'female' | 'mixed'
 */
export function getBrazilianNameByGender(
  gender: 'male' | 'female' | 'mixed' = 'mixed',
): string {
  switch (gender) {
    case 'male':
      return BRAZILIAN_MALE_NAMES[
        Math.floor(Math.random() * BRAZILIAN_MALE_NAMES.length)
      ];
    case 'female':
      return BRAZILIAN_FEMALE_NAMES[
        Math.floor(Math.random() * BRAZILIAN_FEMALE_NAMES.length)
      ];
    case 'mixed':
    default:
      return getRandomBrazilianName();
  }
}
