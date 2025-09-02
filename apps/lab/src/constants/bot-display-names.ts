/**
 * Collection of authentic Brazilian names for bot display purposes
 * Comprehensive mix of common first names and surnames representing Brazilian demographics
 * Used to provide realistic and culturally appropriate bot identities in the application
 */
/**
 * Collection of Brazilian male names with surnames
 * Authentic combinations following Brazilian naming conventions
 */
export const BRAZILIAN_MALE_NAMES = [
	"João Silva",
	"Pedro Santos",
	"Carlos Oliveira",
	"José Lima",
	"Antonio Costa",
	"Francisco Ferreira",
	"Marcos Rodrigues",
	"Paulo Almeida",
	"Lucas Pereira",
	"Gabriel Souza",
	"Rafael Barbosa",
	"Felipe Carvalho",
	"Bruno Nascimento",
	"Eduardo Ribeiro",
	"Rodrigo Martins",
	"Gustavo Araújo",
	"Leonardo Dias",
	"Daniel Fernandes",
	"Mateus Gomes",
	"André Cardoso",
	"Thiago Mendes",
	"Diego Rocha",
	"Vinicius Castro",
	"Fernando Moreira",
	"Ricardo Azevedo",
] as const;

/**
 * Collection of Brazilian female names with surnames
 * Authentic combinations following Brazilian naming conventions
 */
export const BRAZILIAN_FEMALE_NAMES = [
	"Maria Silva",
	"Ana Santos",
	"Juliana Oliveira",
	"Fernanda Lima",
	"Patricia Costa",
	"Camila Ferreira",
	"Mariana Rodrigues",
	"Gabriela Almeida",
	"Beatriz Pereira",
	"Larissa Souza",
	"Bruna Barbosa",
	"Carolina Carvalho",
	"Amanda Nascimento",
	"Isabela Ribeiro",
	"Leticia Martins",
	"Natalia Araújo",
	"Priscila Dias",
	"Vanessa Fernandes",
	"Carla Gomes",
	"Renata Cardoso",
	"Tatiane Mendes",
	"Viviane Rocha",
	"Simone Castro",
	"Luciana Moreira",
	"Adriana Azevedo",
] as const;

/**
 * Combined collection of all Brazilian names (male and female)
 * Provides complete set for random name selection without gender preference
 */
export const ALL_BRAZILIAN_NAMES = [
	...BRAZILIAN_MALE_NAMES,
	...BRAZILIAN_FEMALE_NAMES,
] as const;

/**
 * Collection of single-word Brazilian first names for bot display
 * Used when simpler name format is preferred or space constraints apply
 */
export const SINGLE_WORD_NAMES = [
	"João",
	"Pedro",
	"Carlos",
	"José",
	"Antonio",
	"Francisco",
	"Marcos",
	"Paulo",
	"Lucas",
	"Gabriel",
	"Rafael",
	"Felipe",
	"Bruno",
	"Eduardo",
	"Rodrigo",
	"Gustavo",
	"Leonardo",
	"Daniel",
	"Mateus",
	"André",
	"Thiago",
	"Diego",
	"Vinicius",
	"Fernando",
	"Ricardo",
	"Alexandre",
	"Roberto",
	"Marcelo",
	"Cristiano",
	"Anderson",
	"Fábio",
	"Renato",
	"Hugo",
	"Leandro",
	"Alex",
	"Douglas",
	"Wagner",
	"Claudio",
	"Mauricio",
	"Sergio",
	"Adriano",
	"Cesar",
	"Rogério",
	"Wilson",
	"Márcio",
	"Jorge",
	"Otávio",
	"Igor",
	"Caio",
	"Victor",
	"Guilherme",
	"Henrique",
	"Matheus",
	"Samuel",
	"Nathan",
	"Davi",
	"Bernardo",
	"Heitor",
	"Theo",
	"Murilo",
	"Enzo",
	"Maria",
	"Ana",
	"Juliana",
	"Fernanda",
	"Patricia",
	"Camila",
	"Mariana",
	"Gabriela",
	"Beatriz",
	"Larissa",
	"Bruna",
	"Carolina",
	"Amanda",
	"Isabela",
	"Leticia",
	"Natalia",
	"Priscila",
	"Vanessa",
	"Carla",
	"Renata",
	"Tatiane",
	"Viviane",
	"Simone",
	"Luciana",
	"Adriana",
	"Claudia",
	"Rosana",
	"Márcia",
	"Cristina",
	"Andrea",
	"Fabiana",
	"Helena",
	"Alexandra",
	"Daniela",
	"Victoria",
	"Guilhermina",
	"Henriqueta",
	"Matheusa",
	"Samuela",
	"Nathana",
	"Bernarda",
	"Heitora",
	"Thea",
	"Murila",
	"Enza",
] as const;

/**
 * Collection of two-word Brazilian name combinations
 * Includes first name + surname and first name + second first name patterns
 */
export const TWO_WORD_NAMES = [
	"João Silva",
	"Pedro Santos",
	"Carlos Oliveira",
	"José Lima",
	"Antonio Costa",
	"Francisco Ferreira",
	"Marcos Rodrigues",
	"Paulo Almeida",
	"Lucas Pereira",
	"Gabriel Souza",
	"Rafael Barbosa",
	"Felipe Carvalho",
	"Bruno Nascimento",
	"Eduardo Ribeiro",
	"Rodrigo Martins",
	"Gustavo Araújo",
	"Leonardo Dias",
	"Daniel Fernandes",
	"Mateus Gomes",
	"André Cardoso",
	"Thiago Mendes",
	"Diego Rocha",
	"Vinicius Castro",
	"Fernando Moreira",
	"Ricardo Azevedo",
	"Alexandre Teixeira",
	"Roberto Lopes",
	"Marcelo Cunha",
	"Cristiano Monteiro",
	"Anderson Santos",
	"Fábio Alves",
	"Renato Nogueira",
	"Hugo Mendonça",
	"Leandro Costa",
	"Alex Santos",
	"Douglas Silva",
	"Wagner Oliveira",
	"Claudio Santos",
	"Mauricio Lima",
	"Sergio Costa",
	"Adriano Ferreira",
	"Cesar Rodrigues",
	"Rogério Almeida",
	"Wilson Pereira",
	"Márcio Souza",
	"Jorge Barbosa",
	"Otávio Carvalho",
	"Igor Nascimento",
	"Caio Ribeiro",
	"Victor Martins",
	"Guilherme Araújo",
	"Henrique Dias",
	"Matheus Fernandes",
	"Samuel Gomes",
	"Nathan Cardoso",
	"Davi Mendes",
	"Bernardo Rocha",
	"Heitor Castro",
	"Theo Moreira",
	"Murilo Azevedo",
	"Enzo Teixeira",
	"João Pedro",
	"Pedro Henrique",
	"Carlos Eduardo",
	"José Carlos",
	"Antonio José",
	"Francisco Carlos",
	"Marcos Paulo",
	"Paulo Roberto",
	"Lucas Gabriel",
	"Gabriel Henrique",
	"Rafael Augusto",
	"Felipe Martins",
	"Bruno Alexandre",
	"Eduardo Santos",
	"Rodrigo Silva",
	"Gustavo Costa",
	"Leonardo Lima",
	"Daniel Oliveira",
	"Mateus Santos",
	"André Costa",
	"Thiago Silva",
	"Diego Santos",
	"Vinicius Costa",
	"Fernando Silva",
	"Ricardo Santos",
	"Alexandre Costa",
	"Roberto Silva",
	"Marcelo Santos",
	"Cristiano Costa",
	"Anderson Silva",
	"Fábio Santos",
	"Renato Costa",
	"Hugo Silva",
	"Leandro Santos",
	"Alex Costa",
	"Douglas Santos",
	"Wagner Costa",
	"Claudio Silva",
	"Mauricio Santos",
	"Sergio Silva",
	"Adriano Costa",
	"Cesar Santos",
	"Rogério Silva",
	"Wilson Costa",
	"Márcio Silva",
	"Jorge Costa",
	"Otávio Silva",
	"Igor Costa",
	"Caio Santos",
	"Victor Costa",
	"Guilherme Silva",
	"Henrique Santos",
	"Matheus Costa",
	"Samuel Silva",
	"Nathan Costa",
	"Davi Santos",
	"Bernardo Silva",
	"Heitor Costa",
	"Theo Santos",
	"Murilo Costa",
	"Enzo Silva",
	"João Vitor",
	"Pedro Lucas",
	"Carlos Henrique",
	"José Pedro",
	"Antonio Gabriel",
	"Francisco Rafael",
	"Marcos Felipe",
	"Paulo Bruno",
	"Lucas Eduardo",
	"Gabriel Rodrigo",
	"Rafael Gustavo",
	"Felipe Leonardo",
	"Bruno Daniel",
	"Eduardo Mateus",
	"Rodrigo André",
	"Gustavo Thiago",
	"Leonardo Diego",
	"Daniel Vinicius",
	"Mateus Fernando",
	"André Ricardo",
	"Thiago Alexandre",
	"Diego Roberto",
	"Vinicius Marcelo",
	"Fernando Cristiano",
	"Ricardo Anderson",
	"Alexandre Fábio",
	"Roberto Renato",
	"Marcelo Hugo",
	"Cristiano Leandro",
	"Anderson Alex",
	"Fábio Douglas",
	"Renata Wagner",
	"Hugo Claudio",
	"Leandro Mauricio",
	"Alex Sergio",
	"Douglas Adriano",
	"Wagner Cesar",
	"Claudio Rogério",
	"Mauricio Wilson",
	"Sergio Márcio",
	"Adriano Jorge",
	"Cesar Otávio",
	"Rogério Igor",
	"Wilson Caio",
	"Márcio Victor",
	"Jorge Guilherme",
	"Otávio Henrique",
	"Igor Matheus",
	"Caio Samuel",
	"Victor Nathan",
	"Guilherme Davi",
	"Henrique Bernardo",
	"Matheus Heitor",
	"Samuel Theo",
	"Nathan Murilo",
	"Davi Enzo",
	"Bernardo João",
	"Heitor Pedro",
	"Theo Carlos",
	"Murilo José",
	"Enzo Antonio",
	"Maria Silva",
	"Ana Santos",
	"Juliana Oliveira",
	"Fernanda Lima",
	"Patricia Costa",
	"Camila Ferreira",
	"Mariana Rodrigues",
	"Gabriela Almeida",
	"Beatriz Pereira",
	"Larissa Souza",
	"Bruna Barbosa",
	"Carolina Carvalho",
	"Amanda Nascimento",
	"Isabela Ribeiro",
	"Leticia Martins",
	"Natalia Araújo",
	"Priscila Dias",
	"Vanessa Fernandes",
	"Carla Gomes",
	"Renata Cardoso",
	"Tatiane Mendes",
	"Viviane Rocha",
	"Simone Castro",
	"Luciana Moreira",
	"Adriana Azevedo",
	"Claudia Teixeira",
	"Rosana Lopes",
	"Márcia Cunha",
	"Cristina Monteiro",
	"Andrea Santos",
	"Fabiana Alves",
	"Renata Nogueira",
	"Helena Mendonça",
	"Luciana Costa",
	"Alexandra Santos",
	"Daniela Silva",
	"Victoria Martins",
	"Guilhermina Araújo",
	"Henriqueta Dias",
	"Matheusa Fernandes",
	"Samuela Gomes",
	"Nathana Cardoso",
	"Bernarda Rocha",
	"Heitora Castro",
	"Thea Moreira",
	"Murila Azevedo",
	"Enza Teixeira",
	"João Vitora",
	"Pedra Lucas",
	"Carla Henrique",
	"José Pedro",
	"Antonia Gabriel",
	"Francisca Rafael",
	"Marcia Felipe",
	"Paula Bruno",
	"Lucas Eduardo",
	"Gabriela Rodrigo",
	"Rafaela Gustavo",
	"Felipe Leonardo",
	"Bruna Daniel",
	"Eduarda Mateus",
	"Rodriga André",
	"Gustava Thiago",
	"Leonarda Diego",
	"Daniela Vinicius",
	"Mateusa Fernando",
	"Andréa Ricardo",
	"Thiaga Alexandre",
	"Diega Roberto",
	"Fernanda Cristiano",
	"Ricarda Anderson",
	"Alexandra Fábio",
	"Roberta Renato",
	"Marcela Hugo",
	"Cristiana Leandro",
	"Andrea Alex",
	"Fábiana Douglas",
	"Renata Wagner",
	"Helena Claudio",
	"Luciana Mauricio",
	"Alexandra Sergio",
	"Daniela Adriano",
	"Wagner Cesar",
	"Claudia Rogério",
	"Márcia Wilson",
	"Sergia Márcio",
	"Adriana Jorge",
	"Cesar Otávio",
	"Rogéria Igor",
	"Wilson Caio",
	"Márcia Victor",
	"Jorge Guilherme",
	"Otávia Henrique",
	"Igor Matheus",
	"Caia Samuel",
	"Victoria Nathan",
	"Guilhermina Davi",
	"Henriqueta Bernardo",
	"Matheusa Heitor",
	"Samuela Theo",
	"Nathana Murilo",
	"Bernarda João",
	"Heitora Pedro",
	"Thea Carlos",
	"Murila José",
	"Enza Antonio",
] as const;

/**
 * Generates a random Brazilian name with balanced single/two-word selection
 *
 * Uses randomization to choose between single-word and two-word name formats
 * Provides natural variation in bot name complexity and authenticity
 *
 * @returns Random Brazilian name (either single word or two words)
 */
export function getRandomBrazilianName(): string {
	// Randomly choose between single-word and two-word names
	const useSingleWord = Math.random() < 0.5;

	if (useSingleWord) {
		const randomIndex = Math.floor(Math.random() * SINGLE_WORD_NAMES.length);

		return SINGLE_WORD_NAMES[randomIndex];
	} else {
		const randomIndex = Math.floor(Math.random() * TWO_WORD_NAMES.length);

		return TWO_WORD_NAMES[randomIndex];
	}
}

/**
 * Generates multiple unique Brazilian names with format randomization
 *
 * Combines single-word and two-word names to create diverse set of unique identities
 * Ensures no duplicate names in the returned collection
 * Returns all available names if count exceeds total available names
 *
 * @param count - Number of unique names to generate
 * @returns Array of unique Brazilian names with mixed formatting
 */
export function getMultipleBrazilianNames(count: number): string[] {
	if (count <= 0) {
		return [];
	}

	const allNames = [...SINGLE_WORD_NAMES, ...TWO_WORD_NAMES];

	if (count >= allNames.length) {
		return [...allNames];
	}

	const shuffled = [...allNames].sort(() => Math.random() - 0.5);

	return shuffled.slice(0, count);
}

/**
 * Generates Brazilian name based on gender preference with format randomization
 *
 * Filters name selection by gender preference while maintaining single/two-word randomization
 * Falls back to mixed gender selection if gender-specific filtering fails
 *
 * @param gender - Gender preference for name selection ('male' | 'female' | 'mixed')
 * @returns Brazilian name matching gender preference with random formatting
 */
export function getBrazilianNameByGender(
	gender: "male" | "female" | "mixed" = "mixed",
): string {
	// Randomly choose between single-word and two-word names
	const useSingleWord = Math.random() < 0.5;

	switch (gender) {
		case "male":
			if (useSingleWord) {
				const maleSingleNames = SINGLE_WORD_NAMES.filter((name) =>
					BRAZILIAN_MALE_NAMES.some((maleName) => maleName.startsWith(name)),
				);

				return maleSingleNames[
					Math.floor(Math.random() * maleSingleNames.length)
				];
			} else {
				return BRAZILIAN_MALE_NAMES[
					Math.floor(Math.random() * BRAZILIAN_MALE_NAMES.length)
				];
			}
		case "female":
			if (useSingleWord) {
				const femaleSingleNames = SINGLE_WORD_NAMES.filter((name) =>
					BRAZILIAN_FEMALE_NAMES.some((femaleName) =>
						femaleName.startsWith(name),
					),
				);

				return femaleSingleNames[
					Math.floor(Math.random() * femaleSingleNames.length)
				];
			} else {
				return BRAZILIAN_FEMALE_NAMES[
					Math.floor(Math.random() * BRAZILIAN_FEMALE_NAMES.length)
				];
			}
		default:
			return getRandomBrazilianName();
	}
}

/**
 * Generates a random single-word Brazilian first name
 *
 * Selects from curated collection of authentic Brazilian first names
 * Useful for contexts requiring simpler name format or space constraints
 *
 * @returns Random single-word Brazilian first name
 */
export function getRandomSingleWordName(): string {
	const randomIndex = Math.floor(Math.random() * SINGLE_WORD_NAMES.length);

	return SINGLE_WORD_NAMES[randomIndex];
}

/**
 * Generates a random two-word Brazilian name combination
 *
 * Selects from collection of authentic first name + surname combinations
 * Provides more formal and complete name representation for bot identities
 *
 * @returns Random two-word Brazilian name combination
 */
export function getRandomTwoWordName(): string {
	const randomIndex = Math.floor(Math.random() * TWO_WORD_NAMES.length);

	return TWO_WORD_NAMES[randomIndex];
}

/**
 * Generates multiple Brazilian names with specific word count preference
 *
 * Allows control over name format consistency in result set
 * Supports single-word only, two-word only, or mixed format collections
 * Returns all available names of specified type if count exceeds available options
 *
 * @param count - Number of names to generate
 * @param wordCount - Format preference ('single' | 'two' | 'mixed')
 * @returns Array of Brazilian names matching the specified word count preference
 */
export function getNamesByWordCount(
	count: number,
	wordCount: "single" | "two" | "mixed" = "mixed",
): string[] {
	if (count <= 0) {
		return [];
	}

	let names: string[];

	switch (wordCount) {
		case "single":
			names = [...SINGLE_WORD_NAMES];

			break;
		case "two":
			names = [...TWO_WORD_NAMES];

			break;
		default:
			names = [...SINGLE_WORD_NAMES, ...TWO_WORD_NAMES];

			break;
	}

	if (count >= names.length) {
		return [...names];
	}

	const shuffled = [...names].sort(() => Math.random() - 0.5);

	return shuffled.slice(0, count);
}
