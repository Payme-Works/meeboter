"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api } from "@/trpc/react";

const multiBotSchema = z.object({
	meetingUrl: z.string().min(1, "Meeting URL is required"),
	botCount: z
		.number()
		.min(1, "At least 1 bot is required")
		.max(10, "Maximum 10 bots allowed"),
});

type MultiBotFormData = z.infer<typeof multiBotSchema>;

interface MultiBotJoinDialogProps {
	open: boolean;
	onClose: () => void;
}

export function MultiBotJoinDialog({ open, onClose }: MultiBotJoinDialogProps) {
	const [isSubmitting, setIsSubmitting] = useState(false);

	const form = useForm<MultiBotFormData>({
		resolver: zodResolver(multiBotSchema),
		defaultValues: {
			meetingUrl: "",
			botCount: 1,
		},
	});

	const createBotMutation = api.bots.createBot.useMutation();
	const utils = api.useUtils();

	const brazilianNames = [
		// One-word names (250 names)
		"João", "Pedro", "Carlos", "José", "Antonio", "Francisco", "Marcos", "Paulo", "Lucas", "Gabriel",
		"Rafael", "Felipe", "Bruno", "Eduardo", "Rodrigo", "Gustavo", "Leonardo", "Daniel", "Mateus", "André",
		"Thiago", "Diego", "Vinicius", "Fernando", "Ricardo", "Alexandre", "Roberto", "Marcelo", "Cristiano", "Anderson",
		"Fábio", "Renato", "Hugo", "Leandro", "Alex", "Douglas", "Wagner", "Claudio", "Mauricio", "Sergio",
		"Adriano", "Cesar", "Rogério", "Wilson", "Márcio", "Jorge", "Otávio", "Igor", "Caio", "Victor",
		"Guilherme", "Henrique", "Matheus", "Samuel", "Nathan", "Davi", "Bernardo", "Heitor", "Theo", "Murilo",
		"Enzo", "Arthur", "Miguel", "Nicolas", "Lorenzo", "Joaquim", "Benicio", "Pietro", "Antônio", "Emanuel",
		"Valentim", "Ravi", "Benjamin", "Noah", "Gael", "Levi", "Apollo", "Martin", "Asafe", "Calebe",
		"Alice", "Sophia", "Helena", "Valentina", "Laura", "Isabella", "Manuela", "Júlia", "Heloísa", "Luiza",
		"Luna", "Giovanna", "Maria", "Lorena", "Lívia", "Antonella", "Isis", "Agatha", "Sarah", "Clara",
		"Cecília", "Esther", "Lara", "Mariana", "Emanuelly", "Rebeca", "Ana", "Vitória", "Catarina", "Bianca",
		"Lavínia", "Eduarda", "Stella", "Nina", "Fernanda", "Gabrielly", "Yasmin", "Pietra", "Rayssa", "Liz",
		"Mirella", "Melissa", "Malu", "Nicole", "Bárbara", "Elisa", "Maitê", "Clarice", "Larissa", "Marina",
		"Juliana", "Patricia", "Camila", "Beatriz", "Bruna", "Carolina", "Amanda", "Isabela", "Leticia", "Natalia",
		"Priscila", "Vanessa", "Carla", "Renata", "Tatiane", "Viviane", "Simone", "Luciana", "Adriana", "Claudia",
		"Rosana", "Márcia", "Cristina", "Andrea", "Fabiana", "Alexandra", "Daniela", "Victoria", "Guilhermina", "Henriqueta",
		"Luana", "Rafaela", "Débora", "Mônica", "Sandra", "Silvia", "Vera", "Regina", "Sonia", "Eliana",
		"Sueli", "Marta", "Célia", "Tânia", "Roseane", "Fátima", "Rita", "Lúcia", "Denise", "Valeria",
		"Joana", "Tereza", "Aparecida", "Rose", "Neusa", "Irene", "Solange", "Conceição", "Terezinha", "Josefa",
		"Antonia", "Francisca", "Rosa", "Marlene", "Raimunda", "Benedita", "Edna", "Sebastião", "Manoel", "Raimundo",
		"João", "Antônio", "José", "Francisco", "Carlos", "Paulo", "Pedro", "Lucas", "Luiz", "Marcos",
		"Luís", "Miguel", "Gael", "Arthur", "Bernardo", "Samuel", "Noah", "Mateus", "Theo", "Dante",
		"Rafael", "Gabriel", "Henrique", "Gustavo", "Enzo", "Nicolas", "Lorenzo", "Isaac", "Élio", "Cauã",
		"Bento", "Vicente", "Ravi", "Benjamin", "Caleb", "Joaquim", "Levi", "Benício", "Bryan", "Ian",
		"Cauê", "Oliver", "Lucca", "Apollo", "Kai", "Ryan", "Liam", "Raul", "Apolo", "Anthony",
		
		// Two-word names (250 names)
		"João Silva", "Pedro Santos", "Carlos Oliveira", "José Lima", "Antonio Costa", "Francisco Ferreira", "Marcos Rodrigues", "Paulo Almeida", "Lucas Pereira", "Gabriel Souza",
		"Rafael Barbosa", "Felipe Carvalho", "Bruno Nascimento", "Eduardo Ribeiro", "Rodrigo Martins", "Gustavo Araújo", "Leonardo Dias", "Daniel Fernandes", "Mateus Gomes", "André Cardoso",
		"Thiago Mendes", "Diego Rocha", "Vinicius Castro", "Fernando Moreira", "Ricardo Azevedo", "Alexandre Teixeira", "Roberto Lopes", "Marcelo Cunha", "Cristiano Monteiro", "Anderson Freitas",
		"Fábio Alves", "Renato Nogueira", "Hugo Mendonça", "Leandro Costa", "Alex Miranda", "Douglas Silva", "Wagner Oliveira", "Claudio Santos", "Mauricio Lima", "Sergio Costa",
		"Adriano Ferreira", "Cesar Rodrigues", "Rogério Almeida", "Wilson Pereira", "Márcio Souza", "Jorge Barbosa", "Otávio Carvalho", "Igor Nascimento", "Caio Ribeiro", "Victor Martins",
		"Guilherme Araújo", "Henrique Dias", "Matheus Fernandes", "Samuel Gomes", "Nathan Cardoso", "Davi Mendes", "Bernardo Rocha", "Heitor Castro", "Theo Moreira", "Murilo Azevedo",
		"Enzo Teixeira", "Arthur Lopes", "Miguel Cunha", "Nicolas Monteiro", "Lorenzo Freitas", "Joaquim Alves", "Benicio Nogueira", "Pietro Mendonça", "Antônio Costa", "Emanuel Miranda",
		"Valentim Silva", "Ravi Santos", "Benjamin Oliveira", "Noah Lima", "Gael Costa", "Levi Ferreira", "Apollo Rodrigues", "Martin Almeida", "Asafe Pereira", "Calebe Souza",
		"Maria Silva", "Ana Santos", "Juliana Oliveira", "Fernanda Lima", "Patricia Costa", "Camila Ferreira", "Mariana Rodrigues", "Gabriela Almeida", "Beatriz Pereira", "Larissa Souza",
		"Bruna Barbosa", "Carolina Carvalho", "Amanda Nascimento", "Isabela Ribeiro", "Leticia Martins", "Natalia Araújo", "Priscila Dias", "Vanessa Fernandes", "Carla Gomes", "Renata Cardoso",
		"Tatiane Mendes", "Viviane Rocha", "Simone Castro", "Luciana Moreira", "Adriana Azevedo", "Claudia Teixeira", "Rosana Lopes", "Márcia Cunha", "Cristina Monteiro", "Andrea Freitas",
		"Fabiana Alves", "Helena Nogueira", "Alexandra Mendonça", "Daniela Costa", "Victoria Miranda", "Guilhermina Silva", "Henriqueta Santos", "Matheusa Oliveira", "Samuela Lima", "Nathana Costa",
		"Alice Ferreira", "Sophia Rodrigues", "Helena Almeida", "Valentina Pereira", "Laura Souza", "Isabella Barbosa", "Manuela Carvalho", "Júlia Nascimento", "Heloísa Ribeiro", "Luiza Martins",
		"Luna Araújo", "Giovanna Dias", "Lorena Fernandes", "Lívia Gomes", "Antonella Cardoso", "Isis Mendes", "Agatha Rocha", "Sarah Castro", "Clara Moreira", "Cecília Azevedo",
		"Esther Teixeira", "Lara Lopes", "Emanuelly Cunha", "Rebeca Monteiro", "Vitória Freitas", "Catarina Alves", "Bianca Nogueira", "Lavínia Mendonça", "Eduarda Costa", "Stella Miranda",
		"Nina Silva", "Gabrielly Santos", "Yasmin Oliveira", "Pietra Lima", "Rayssa Costa", "Liz Ferreira", "Mirella Rodrigues", "Melissa Almeida", "Malu Pereira", "Nicole Souza",
		"Bárbara Barbosa", "Elisa Carvalho", "Maitê Nascimento", "Clarice Ribeiro", "Marina Martins", "Luana Araújo", "Rafaela Dias", "Débora Fernandes", "Mônica Gomes", "Sandra Cardoso",
		"Silvia Mendes", "Vera Rocha", "Regina Castro", "Sonia Moreira", "Eliana Azevedo", "Sueli Teixeira", "Marta Lopes", "Célia Cunha", "Tânia Monteiro", "Roseane Freitas",
		"Fátima Alves", "Rita Nogueira", "Lúcia Mendonça", "Denise Costa", "Valeria Miranda", "Joana Silva", "Tereza Santos", "Aparecida Oliveira", "Rose Lima", "Neusa Costa",
		"Irene Ferreira", "Solange Rodrigues", "Conceição Almeida", "Terezinha Pereira", "Josefa Souza", "Antonia Barbosa", "Francisca Carvalho", "Rosa Nascimento", "Marlene Ribeiro", "Raimunda Martins",
		"Benedita Araújo", "Edna Dias", "Sebastião Santos", "Manoel Silva", "Raimundo Costa", "João Pedro", "Pedro Henrique", "Carlos Eduardo", "José Carlos", "Antonio José",
		"Francisco Carlos", "Marcos Paulo", "Paulo Roberto", "Lucas Gabriel", "Gabriel Henrique", "Rafael Augusto", "Felipe Martins", "Bruno Alexandre", "Eduardo Santos", "Rodrigo Silva",
		"Gustavo Costa", "Leonardo Lima", "Daniel Oliveira", "Mateus Santos", "André Costa", "Thiago Silva", "Diego Santos", "Vinicius Costa", "Fernando Silva", "Ricardo Santos",
		"Alexandre Costa", "Roberto Silva", "Marcelo Santos", "Cristiano Costa", "Anderson Silva", "Fábio Santos", "Renato Costa", "Hugo Silva", "Leandro Santos", "Alex Costa",
		"Douglas Santos", "Wagner Costa", "Claudio Silva", "Mauricio Santos", "Sergio Silva", "Adriano Costa", "Cesar Santos", "Rogério Silva", "Wilson Costa", "Márcio Silva"
	];

	const getRandomBrazilianNames = (count: number): string[] => {
		const shuffled = [...brazilianNames].sort(() => Math.random() - 0.5);

		return shuffled.slice(0, Math.min(count, brazilianNames.length));
	};

	const detectPlatform = (url: string): "google" | "teams" | "zoom" => {
		if (url.includes("meet.google.com")) return "google";

		if (url.includes("teams.microsoft.com") || url.includes("teams.live.com"))
			return "teams";

		if (url.includes("zoom.us")) return "zoom";

		return "google"; // Default to google
	};

	const handleSubmit = async (data: MultiBotFormData) => {
		setIsSubmitting(true);

		try {
			const platform = detectPlatform(data.meetingUrl);
			const botNames = getRandomBrazilianNames(data.botCount);

			// Create multiple bots
			const botCreationPromises = Array.from(
				{ length: data.botCount },
				(_, index) =>
					createBotMutation.mutateAsync({
						botDisplayName: botNames[index] || `Bot ${index + 1}`,
						meetingTitle: `Multi-bot session`,
						meetingInfo: {
							platform,
							meetingUrl: data.meetingUrl,
						},
						recordingEnabled: false,
						startTime: new Date().toISOString(),
						endTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
					}),
			);

			await Promise.all(botCreationPromises);

			// Refresh bots list
			await utils.bots.getBots.invalidate();

			form.reset();
			onClose();
		} catch (error) {
			console.error("Failed to create bots:", error);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Join Multiple Bots to Meeting</DialogTitle>
					<DialogDescription>
						Add multiple bots to any meeting platform (Google Meet, Microsoft
						Teams, or Zoom)
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(handleSubmit)}
						className="space-y-4"
					>
						<FormField
							control={form.control}
							name="meetingUrl"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Meeting URL</FormLabel>
									<FormControl>
										<Input
											placeholder="https://meet.google.com/abc-defg-hij"
											{...field}
										/>
									</FormControl>
									<FormDescription>
										Supports Google Meet, Microsoft Teams, and Zoom links
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="botCount"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Number of Bots</FormLabel>
									<FormControl>
										<Input
											type="number"
											min="1"
											max="10"
											placeholder="1"
											{...field}
											value={field.value}
											onChange={(e) =>
												field.onChange(e.target.valueAsNumber || 1)
											}
										/>
									</FormControl>
									<FormDescription>
										Number of bots to join the meeting (1-10)
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div className="flex justify-end space-x-2">
							<Button type="button" variant="outline" onClick={onClose}>
								Cancel
							</Button>
							<Button type="submit" disabled={isSubmitting}>
								{isSubmitting ? "Creating Bots..." : "Create Bots"}
							</Button>
						</div>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
