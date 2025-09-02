/**
 * Collection of Brazilian first names used for generating bot display names
 * Includes both traditional and modern Brazilian names for diverse representation
 */
const FIRST_NAMES = [
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
	"Arthur",
	"Miguel",
	"Nicolas",
	"Lorenzo",
	"Joaquim",
	"Benicio",
	"Pietro",
	"Antônio",
	"Emanuel",
	"Valentim",
	"Ravi",
	"Benjamin",
	"Noah",
	"Gael",
	"Levi",
	"Apollo",
	"Martin",
	"Asafe",
	"Calebe",
	"Alice",
	"Sophia",
	"Helena",
	"Valentina",
	"Laura",
	"Isabella",
	"Manuela",
	"Júlia",
	"Heloísa",
	"Luiza",
	"Luna",
	"Giovanna",
	"Maria",
	"Lorena",
	"Lívia",
	"Antonella",
	"Isis",
	"Agatha",
	"Sarah",
	"Clara",
	"Cecília",
	"Esther",
	"Lara",
	"Mariana",
	"Emanuelly",
	"Rebeca",
	"Ana",
	"Vitória",
	"Catarina",
	"Bianca",
	"Lavínia",
	"Eduarda",
	"Stella",
	"Nina",
	"Fernanda",
	"Gabrielly",
	"Yasmin",
	"Pietra",
	"Rayssa",
	"Liz",
	"Mirella",
	"Melissa",
	"Malu",
	"Nicole",
	"Bárbara",
	"Elisa",
	"Maitê",
	"Clarice",
	"Larissa",
	"Marina",
	"Juliana",
	"Patricia",
	"Camila",
	"Beatriz",
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
	"Alexandra",
	"Daniela",
	"Victoria",
	"Guilhermina",
	"Henriqueta",
	"Luana",
	"Rafaela",
	"Débora",
	"Mônica",
	"Sandra",
	"Silvia",
	"Vera",
	"Regina",
	"Sonia",
	"Eliana",
	"Sueli",
	"Marta",
	"Célia",
	"Tânia",
	"Roseane",
	"Fátima",
	"Rita",
	"Lúcia",
	"Denise",
	"Valeria",
	"Joana",
	"Tereza",
	"Aparecida",
	"Rose",
	"Neusa",
	"Irene",
	"Solange",
	"Conceição",
	"Terezinha",
	"Josefa",
	"Antonia",
	"Francisca",
	"Rosa",
	"Marlene",
	"Raimunda",
	"Benedita",
	"Edna",
	"Sebastião",
	"Manoel",
	"Raimundo",
];

/**
 * Collection of Brazilian last names used for generating bot display names
 * Contains common surnames from Brazilian families and demographics
 */
const LAST_NAMES = [
	"Silva",
	"Santos",
	"Oliveira",
	"Lima",
	"Costa",
	"Ferreira",
	"Rodrigues",
	"Almeida",
	"Pereira",
	"Souza",
	"Barbosa",
	"Carvalho",
	"Nascimento",
	"Ribeiro",
	"Martins",
	"Araújo",
	"Dias",
	"Fernandes",
	"Gomes",
	"Cardoso",
	"Mendes",
	"Rocha",
	"Castro",
	"Moreira",
	"Azevedo",
	"Teixeira",
	"Lopes",
	"Cunha",
	"Monteiro",
	"Freitas",
	"Alves",
	"Nogueira",
	"Mendonça",
	"Miranda",
	"Vieira",
	"Correia",
	"Nunes",
	"Campos",
	"Ramos",
	"Reis",
	"Machado",
	"Farias",
	"Melo",
	"Santana",
	"Pinto",
	"Cavalcanti",
	"Duarte",
	"Torres",
	"Andrade",
	"Barros",
	"Matos",
	"Coelho",
	"Medeiros",
	"Moura",
	"Peixoto",
	"Magalhães",
	"Brito",
	"Guimarães",
	"Fonseca",
	"Vasconcelos",
	"Siqueira",
	"Borges",
	"Tavares",
	"Godoy",
	"Soares",
	"Bezerra",
	"Batista",
	"Morais",
	"Carmo",
	"Porto",
];

/**
 * Generates random Brazilian names using composite algorithm implementation
 *
 * Naming rules and patterns:
 * - First name + last name combinations (e.g., "João Silva")
 * - First name + first name combinations (e.g., "João Pedro")
 * - Single first name only variations
 * - Last name + last name combinations are explicitly NOT allowed
 *
 * Uses uniqueness validation to prevent duplicate names in the result set
 * Falls back to numbered bot names if unique name generation fails after maximum attempts
 *
 * @param count - Number of unique names to generate
 * @returns Array of unique Brazilian names following the specified naming rules
 */
export function getRandomBrazilianNames(count: number): string[] {
	const names: string[] = [];
	const usedNames = new Set<string>();

	for (let i = 0; i < count; i++) {
		let newName: string;
		let attempts = 0;
		const maxAttempts = 100;

		do {
			const useComposite = Math.random() < 0.7;

			if (useComposite) {
				const firstName =
					FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];

				const isFirstPlusFirst = Math.random() < 0.3;

				if (isFirstPlusFirst) {
					const secondFirstName =
						FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];

					newName = `${firstName} ${secondFirstName}`;
				} else {
					const lastName =
						LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];

					newName = `${firstName} ${lastName}`;
				}
			} else {
				newName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
			}

			attempts++;
		} while (usedNames.has(newName) && attempts < maxAttempts);

		if (attempts < maxAttempts) {
			usedNames.add(newName);
			names.push(newName);
		} else {
			names.push(`Bot ${i + 1}`);
		}
	}

	return names;
}
