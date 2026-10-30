'use strict';

const crypto = require('crypto');
const { db } = require('../../database/connection');
db.exec(`CREATE TABLE IF NOT EXISTS quiz_question_history (platform TEXT NOT NULL, community_id TEXT NOT NULL, question_key TEXT NOT NULL, last_used INTEGER NOT NULL, PRIMARY KEY(platform, community_id, question_key))`);

const questions = [
    // MATHEMATICS
    { category: 'Mathematics', question: 'What is 15% of 240?', options: ['24', '30', '36', '42'], answer: 'C' },
    { category: 'Mathematics', question: 'What is the next prime number after 31?', options: ['37', '33', '35', '39'], answer: 'A' },
    { category: 'Mathematics', question: 'What is 2⁷?', options: ['64', '128', '256', '144'], answer: 'B' },
    { category: 'Mathematics', question: 'A jacket costs $80 after a 20% discount. What was the original price?', options: ['$96', '$100', '$104', '$120'], answer: 'B' },
    { category: 'Mathematics', question: 'What is the derivative of x³?', options: ['x²', '3x²', '3x', 'x³/3'], answer: 'B' },
    { category: 'Mathematics', question: 'What is the sum of the interior angles of a hexagon?', options: ['540°', '900°', '720°', '1080°'], answer: 'C' },
    { category: 'Mathematics', question: 'What is the sum of all integers from 1 to 100?', options: ['5050', '5000', '4950', '5100'], answer: 'A' },
    { category: 'Mathematics', question: 'What is the value of log₂(64)?', options: ['5', '6', '7', '8'], answer: 'B' },
    { category: 'Mathematics', question: 'What is 15 × 647?', options: ['9705', '9715', '9725', '9735'], answer: 'A' },
    { category: 'Mathematics', question: 'What is the square root of 144?', options: ['10', '11', '12', '14'], answer: 'C' },
    { category: 'Mathematics', question: 'What is 25% of 200?', options: ['25', '40', '50', '75'], answer: 'C' },
    { category: 'Mathematics', question: 'What is 9²?', options: ['18', '72', '81', '99'], answer: 'C' },
    { category: 'Mathematics', question: "For f(x) = x²eˣ, what is f'(x)?", options: ['eˣ(x²+2x)', '2xeˣ', 'eˣ(x²−2x)', 'x²eˣ'], answer: 'A' },
    { category: 'Mathematics', question: 'What is the derivative of ln(x²+1)?', options: ['1/(x²+1)', '2x/(x²+1)', '2/(x²+1)', 'ln(2x)'], answer: 'B' },
    { category: 'Mathematics', question: 'A fair coin is tossed three times. What is the probability of exactly two heads?', options: ['1/8', '1/4', '3/8', '1/2'], answer: 'C' },
    { category: 'Mathematics', question: 'What is the determinant of the matrix [[2,3],[4,5]]?', options: ['-2', '2', '10', '22'], answer: 'A' },
    { category: 'Mathematics', question: 'Solve: 3x + 5 = 20. What is x?', options: ['3', '4', '5', '6'], answer: 'C' },
    { category: 'Mathematics', question: 'What is the integral of 2x with respect to x?', options: ['x²', '2x²', 'x² + C', '2'], answer: 'C' },
    { category: 'Mathematics', question: 'What is the value of sin(90°)?', options: ['0', '0.5', '1', '-1'], answer: 'C' },
    { category: 'Mathematics', question: 'What is the determinant of a 2x2 identity matrix?', options: ['0', '1', '2', '-1'], answer: 'B' },
    { category: 'Mathematics', question: 'If log₁₀(x) = 3, what is the value of x?', options: ['30', '300', '1000', '3000'], answer: 'C' },
    { category: 'Mathematics', question: 'What is the sum of the first 10 positive integers?', options: ['45', '55', '50', '65'], answer: 'B' },
    { category: 'Mathematics', question: 'What is the slope of the line represented by 4x - 2y = 8?', options: ['-2', '2', '4', '-4'], answer: 'B' },
    { category: 'Mathematics', question: 'What is the value of 0! (zero factorial)?', options: ['0', '1', 'Undefined', 'Infinity'], answer: 'B' },
    { category: 'Mathematics', question: 'What is the third non-zero number in the expansion of pi (3.14159...)?', options: ['1', '4', '5', '9'], answer: 'B' },
    { category: 'Mathematics', question: 'What is the magnitude of the vector (3, 4)?', options: ['5', '7', '12', '25'], answer: 'A' },
    { category: 'Mathematics', question: 'What is the limit of (1 + 1/n)^n as n approaches infinity?', options: ['0', '1', 'e', 'Infinity'], answer: 'C' },
    { category: 'Mathematics', question: 'What is the solution to x² - 9 = 0?', options: ['x = 3', 'x = -3', 'x = ±3', 'x = 81'], answer: 'C' },
    { category: 'Mathematics', question: 'What is the mode of the dataset: [2, 4, 4, 5, 7, 9, 9, 9, 10]?', options: ['4', '5', '7', '9'], answer: 'D' },
    { category: 'Mathematics', question: 'What is the area of a circle with a radius of 7? (Use π ≈ 22/7)', options: ['44', '154', '49', '308'], answer: 'B' },
    { category: 'Mathematics', question: 'What is cos(0°)?', options: ['0', '1', '0.5', 'Undefined'], answer: 'B' },
    { category: 'Mathematics', question: 'If a triangle has sides of length 6, 8, and 10, what type of triangle is it?', options: ['Equilateral', 'Isosceles', 'Right-angled', 'Obtuse'], answer: 'C' },
    { category: 'Mathematics', question: 'What is 2⁰ + 3⁰ + 4⁰?', options: ['0', '1', '3', '9'], answer: 'C' },
    { category: 'Mathematics', question: 'What is the derivative of cos(x)?', options: ['sin(x)', '-sin(x)', 'tan(x)', '-cos(x)'], answer: 'B' },
    { category: 'Mathematics', question: 'How many sides does a nonagon have?', options: ['7', '8', '9', '10'], answer: 'C' },
    { category: 'Mathematics', question: 'What is the greatest common divisor (GCD) of 36 and 48?', options: ['6', '8', '12', '18'], answer: 'C' },
    { category: 'Mathematics', question: 'What is the value of 5³?', options: ['15', '25', '75', '125'], answer: 'D' },

    // SCIENCE
    { category: 'Science', question: 'In a semiconductor, which type of doping adds more free electrons?', options: ['p-type doping', 'n-type doping', 'Intrinsic doping', 'Isotope substitution'], answer: 'B' },
    { category: 'Science', question: 'What quantity is conserved in all interactions in an isolated system?', options: ['Temperature', 'Momentum', 'Pressure', 'Entropy'], answer: 'B' },
    { category: 'Science', question: 'What is the SI unit of magnetic flux density?', options: ['Weber', 'Tesla', 'Henry', 'Farad'], answer: 'B' },
    { category: 'Science', question: 'Which particle mediates the electromagnetic force?', options: ['Gluon', 'Neutrino', 'Photon', 'Graviton'], answer: 'C' },
    { category: 'Science', question: 'Which thermodynamic law states that the entropy of an isolated system never decreases?', options: ['Zeroth law', 'First law', 'Second law', 'Third law'], answer: 'C' },
    { category: 'Science', question: 'Which planet is known as the Red Planet?', options: ['Earth', 'Mars', 'Jupiter', 'Venus'], answer: 'B' },
    { category: 'Science', question: 'What gas do plants absorb during photosynthesis?', options: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'], answer: 'C' },
    { category: 'Science', question: 'What is the chemical symbol for gold?', options: ['Ag', 'Au', 'Fe', 'Go'], answer: 'B' },
    { category: 'Science', question: 'Which organ pumps blood around the human body?', options: ['Liver', 'Brain', 'Heart', 'Lungs'], answer: 'C' },
    { category: 'Science', question: 'How many bones are typically found in an adult human body?', options: ['206', '208', '210', '212'], answer: 'A' },
    { category: 'Science', question: 'Which particle carries a negative electric charge?', options: ['Electron', 'Proton', 'Neutron', 'Photon'], answer: 'A' },
    { category: 'Science', question: 'Which organelle is known as the powerhouse of the cell?', options: ['Nucleus', 'Ribosome', 'Mitochondria', 'Golgi body'], answer: 'C' },
    { category: 'Science', question: 'Which gas makes up most of Earth\'s atmosphere?', options: ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Argon'], answer: 'C' },
    { category: 'Science', question: 'What is the most abundant element in the universe?', options: ['Helium', 'Hydrogen', 'Oxygen', 'Carbon'], answer: 'B' },
    { category: 'Science', question: 'What is the approximate speed of light in a vacuum?', options: ['3 × 10⁶ m/s', '3 × 10⁵ m/s', '3 × 10⁸ m/s', '3 × 10¹⁰ m/s'], answer: 'C' },
    { category: 'Science', question: 'Which type of chemical bond involves sharing pairs of electrons?', options: ['Ionic', 'Metallic', 'Hydrogen', 'Covalent'], answer: 'D' },
    { category: 'Science', question: 'Which blood type is the universal donor for red blood cells?', options: ['O−', 'AB+', 'A−', 'B+'], answer: 'A' },
    { category: 'Science', question: 'What is the SI unit of capacitance?', options: ['Henry', 'Ohm', 'Weber', 'Farad'], answer: 'D' },
    { category: 'Science', question: 'What is the half-life of Carbon-14 used in radiometric dating approximately?', options: ['1,500 years', '5,730 years', '10,000 years', '50,000 years'], answer: 'B' },
    { category: 'Science', question: 'Which subatomic particle was discovered by J.J. Thomson in 1897?', options: ['Proton', 'Neutron', 'Electron', 'Positron'], answer: 'C' },
    { category: 'Science', question: 'What is the hardest naturally occurring mineral on the Mohs scale?', options: ['Quartz', 'Topaz', 'Corundum', 'Diamond'], answer: 'D' },
    { category: 'Science', question: 'Which law states that pressure is inversely proportional to volume at constant temperature?', options: ['Charles\'s Law', 'Boyle\'s Law', 'Avogadro\'s Law', 'Gay-Lussac\'s Law'], answer: 'B' },
    { category: 'Science', question: 'What type of stellar remnant is formed after a massive star supernova explosion?', options: ['White Dwarf', 'Red Giant', 'Neutron Star', 'Brown Dwarf'], answer: 'C' },
    { category: 'Science', question: 'What is the primary neurotransmitter responsible for muscle contraction at the neuromuscular junction?', options: ['Dopamine', 'Serotonin', 'Acetylcholine', 'Norepinephrine'], answer: 'C' },
    { category: 'Science', question: 'Which quantum number describes the spatial orientation of an orbital in space?', options: ['Principal', 'Angular momentum', 'Magnetic', 'Spin'], answer: 'C' },
    { category: 'Science', question: 'What phenomenon explains why the sky appears blue during the day?', options: ['Refraction', 'Rayleigh scattering', 'Diffraction', 'Total internal reflection'], answer: 'B' },
    { category: 'Science', question: 'What is the main site of ATP synthesis via oxidative phosphorylation in eukaryotic cells?', options: ['Endoplasmic reticulum', 'Inner mitochondrial membrane', 'Nucleolus', 'Cytosol'], answer: 'B' },
    { category: 'Science', question: 'Which thermodynamic law states that entropy of an isolated system always increases?', options: ['Zeroth law', 'First law', 'Second law', 'Third law'], answer: 'C' },
    { category: 'Science', question: 'What is the pH value of pure water at 25°C?', options: ['5', '6', '7', '8'], answer: 'C' },
    { category: 'Science', question: 'Which hormone is produced by the pancreas to lower blood glucose levels?', options: ['Glucagon', 'Insulin', 'Cortisol', 'Thyroxine'], answer: 'B' },
    { category: 'Science', question: 'What layer of Earth\'s atmosphere contains the ozone layer?', options: ['Troposphere', 'Stratosphere', 'Mesosphere', 'Thermosphere'], answer: 'B' },
    { category: 'Science', question: 'What is the SI unit of electric resistance?', options: ['Volt', 'Ampere', 'Ohm', 'Watt'], answer: 'C' },
    { category: 'Science', question: 'Which process converts glucose into pyruvate, yielding ATP in the cytoplasm?', options: ['Glycolysis', 'Krebs Cycle', 'Electron Transport Chain', 'Calvin Cycle'], answer: 'A' },
    { category: 'Science', question: 'What is the primary gas found in natural gas?', options: ['Ethane', 'Methane', 'Propane', 'Butane'], answer: 'B' },
    { category: 'Science', question: 'Which force keeps planets in orbit around the Sun?', options: ['Electromagnetic force', 'Strong nuclear force', 'Gravitational force', 'Weak nuclear force'], answer: 'C' },
    { category: 'Science', question: 'What type of RNA carries genetic information from DNA to the ribosome?', options: ['tRNA', 'rRNA', 'mRNA', 'snRNA'], answer: 'C' },
    { category: 'Science', question: 'Which element has the atomic number 1 on the periodic table?', options: ['Helium', 'Hydrogen', 'Lithium', 'Carbon'], answer: 'B' },
    { category: 'Science', question: 'What principle states that two identical fermions cannot occupy the same quantum state simultaneously?', options: ['Heisenberg Uncertainty Principle', 'Pauli Exclusion Principle', 'Aufbau Principle', 'Hund\'s Rule'], answer: 'B' },

    // GEOGRAPHY
    { category: 'Geography', question: 'What is the capital of Nigeria?', options: ['Lagos', 'Kano', 'Abuja', 'Ibadan'], answer: 'C' },
    { category: 'Geography', question: 'Which is the largest ocean on Earth?', options: ['Atlantic', 'Pacific', 'Indian', 'Arctic'], answer: 'B' },
    { category: 'Geography', question: 'Mount Everest is located in which mountain range?', options: ['Andes', 'Alps', 'Himalayas', 'Rockies'], answer: 'C' },
    { category: 'Geography', question: 'Which continent is Brazil located in?', options: ['Africa', 'Asia', 'South America', 'Europe'], answer: 'C' },
    { category: 'Geography', question: 'What is the capital of France?', options: ['Madrid', 'Rome', 'Berlin', 'Paris'], answer: 'D' },
    { category: 'Geography', question: 'What is the capital of Australia?', options: ['Sydney', 'Melbourne', 'Canberra', 'Perth'], answer: 'C' },
    { category: 'Geography', question: 'Which is the longest river in Africa?', options: ['Congo', 'Niger', 'Zambezi', 'Nile'], answer: 'D' },
    { category: 'Geography', question: 'Which is the deepest lake in the world?', options: ['Lake Superior', 'Lake Baikal', 'Lake Victoria', 'Lake Tanganyika'], answer: 'B' },
    { category: 'Geography', question: 'Which strait separates Spain from Morocco?', options: ['Strait of Gibraltar', 'Bosphorus', 'Strait of Hormuz', 'Strait of Malacca'], answer: 'A' },
    { category: 'Geography', question: 'Which country contains the source of the White Nile?', options: ['Egypt', 'Sudan', 'Burundi / Rwanda', 'Ethiopia'], answer: 'C' },
    { category: 'Geography', question: 'The Strait of Malacca connects the Indian Ocean to which body of water?', options: ['South China Sea', 'Persian Gulf', 'Red Sea', 'Caspian Sea'], answer: 'A' },
    { category: 'Geography', question: 'Which African country is entirely landlocked by South Africa?', options: ['Botswana', 'Lesotho', 'Eswatini', 'Zimbabwe'], answer: 'B' },
    { category: 'Geography', question: 'What is the capital city of Kazakhstan, formerly known as Astana and Nur-Sultan?', options: ['Almaty', 'Tashkent', 'Bishkek', 'Astana'], answer: 'D' },
    { category: 'Geography', question: 'Which tectonic plate boundary is characterized by the formation of deep-sea trenches and island arcs?', options: ['Divergent boundary', 'Transform fault', 'Subduction zone', 'Continental rift'], answer: 'C' },
    { category: 'Geography', question: 'What is the smallest country in the world by land area?', options: ['Monaco', 'San Marino', 'Vatican City', 'Liechtenstein'], answer: 'C' },
    { category: 'Geography', question: 'Which desert is the largest hot desert in the world?', options: ['Gobi Desert', 'Kalahari Desert', 'Atacama Desert', 'Sahara Desert'], answer: 'D' },
    { category: 'Geography', question: 'What is the capital of Japan?', options: ['Kyoto', 'Osaka', 'Tokyo', 'Hiroshima'], answer: 'C' },
    { category: 'Geography', question: 'Which river flows through the Grand Canyon in the United States?', options: ['Mississippi River', 'Colorado River', 'Missouri River', 'Rio Grande'], answer: 'B' },
    { category: 'Geography', question: 'Which country spans two continents, Europe and Asia?', options: ['Greece', 'Turkey', 'Egypt', 'Ukraine'], answer: 'B' },
    { category: 'Geography', question: 'What is the largest island in the world by land area?', options: ['Madagascar', 'Greenland', 'Borneo', 'New Guinea'], answer: 'B' },
    { category: 'Geography', question: 'What is the capital city of Canada?', options: ['Toronto', 'Vancouver', 'Montreal', 'Ottawa'], answer: 'D' },
    { category: 'Geography', question: 'Which mountain range separates Europe from Asia?', options: ['Appalachian Mountains', 'Ural Mountains', 'Andes', 'Atlas Mountains'], answer: 'B' },
    { category: 'Geography', question: 'Which country has the longest coastline in the world?', options: ['Russia', 'Australia', 'Canada', 'Indonesia'], answer: 'C' },
    { category: 'Geography', question: 'What is the capital of Brazil?', options: ['Rio de Janeiro', 'São Paulo', 'Brasília', 'Salvador'], answer: 'C' },
    { category: 'Geography', question: 'Which volcano famously erupted and destroyed the city of Pompeii in 79 AD?', options: ['Mount Etna', 'Mount Vesuvius', 'Krakatoa', 'Mount Fuji'], answer: 'B' },
    { category: 'Geography', question: 'What is the highest waterfall in the world above sea level?', options: ['Niagara Falls', 'Victoria Falls', 'Angel Falls', 'Iguazu Falls'], answer: 'C' },
    { category: 'Geography', question: 'Which sea is located between Jordan and Israel and is famous for its extreme salinity?', options: ['Red Sea', 'Dead Sea', 'Black Sea', 'Mediterranean Sea'], answer: 'B' },
    { category: 'Geography', question: 'What is the capital of South Korea?', options: ['Seoul', 'Busan', 'Incheon', 'Pyongyang'], answer: 'A' },
    { category: 'Geography', question: 'Which European city is built across 118 small islands separated by canals and linked by bridges?', options: ['Amsterdam', 'Venice', 'Copenhagen', 'Hamburg'], answer: 'B' },
    { category: 'Geography', question: 'What is the largest country in South America by land area?', options: ['Argentina', 'Colombia', 'Peru', 'Brazil'], answer: 'D' },
    { category: 'Geography', question: 'Which line of latitude is located at approximately 23.5° North of the Equator?', options: ['Tropic of Capricorn', 'Tropic of Cancer', 'Arctic Circle', 'Prime Meridian'], answer: 'B' },
    { category: 'Geography', question: 'What is the capital of Kenya?', options: ['Mombasa', 'Nairobi', 'Kisumu', 'Nakuru'], answer: 'B' },
    { category: 'Geography', question: 'Which is the largest river by discharge volume of water in the world?', options: ['Amazon River', 'Nile River', 'Yangtze River', 'Mississippi River'], answer: 'A' },
    { category: 'Geography', question: 'Which archipelago nation consists of over 17,000 islands in Southeast Asia?', options: ['Philippines', 'Indonesia', 'Malaysia', 'Maldives'], answer: 'B' },

    // HISTORY
    { category: 'History', question: 'In which year did Nigeria gain independence?', options: ['1957', '1960', '1963', '1970'], answer: 'B' },
    { category: 'History', question: 'Who was the first president of the United States?', options: ['Abraham Lincoln', 'George Washington', 'Thomas Jefferson', 'John Adams'], answer: 'B' },
    { category: 'History', question: 'Which ancient civilization built the pyramids at Giza?', options: ['Romans', 'Greeks', 'Egyptians', 'Persians'], answer: 'C' },
    { category: 'History', question: 'In which year did World War II end?', options: ['1942', '1944', '1945', '1948'], answer: 'C' },
    { category: 'History', question: 'Who was the first person to walk on the Moon?', options: ['Buzz Aldrin', 'Neil Armstrong', 'Yuri Gagarin', 'Michael Collins'], answer: 'B' },
    { category: 'History', question: 'In which year did the Berlin Wall fall?', options: ['1985', '1987', '1989', '1991'], answer: 'C' },
    { category: 'History', question: 'Which African empire was ruled by Mansa Musa?', options: ['Mali Empire', 'Songhai Empire', 'Ghana Empire', 'Kanem-Bornu Empire'], answer: 'A' },
    { category: 'History', question: 'Which treaty formally ended World War I with Germany?', options: ['Treaty of Paris', 'Treaty of Vienna', 'Treaty of Versailles', 'Treaty of Tordesillas'], answer: 'C' },
    { category: 'History', question: 'Which 1815 battle ended Napoleon\'s rule as emperor?', options: ['Waterloo', 'Austerlitz', 'Trafalgar', 'Borodino'], answer: 'A' },
    { category: 'History', question: 'Who was the first emperor of a unified China?', options: ['Kublai Khan', 'Qin Shi Huang', 'Han Wudi', 'Sun Yat-sen'], answer: 'B' },
    { category: 'History', question: 'The Peace of Westphalia in 1648 marked the end of which major European conflict?', options: ['Hundred Years\' War', 'Thirty Years\' War', 'War of the Spanish Succession', 'Napoleonic Wars'], answer: 'B' },
    { category: 'History', question: 'Which empire was defeated at the Battle of Kulikovo in 1380, weakening its dominance over Russian lands?', options: ['Ottoman Empire', 'Golden Horde', 'Byzantine Empire', 'Persian Empire'], answer: 'B' },
    { category: 'History', question: 'Who formulated the laws of planetary motion in the early 17th century?', options: ['Galileo Galilei', 'Johannes Kepler', 'Isaac Newton', 'Nicolaus Copernicus'], answer: 'B' },
    { category: 'History', question: 'The Meiji Restoration of 1868 fundamentally transformed the political and social structure of which nation?', options: ['China', 'Korea', 'Japan', 'Thailand'], answer: 'C' },
    { category: 'History', question: 'Which ancient code of law instituted the principle of "an eye for an eye"?', options: ['Code of Hammurabi', 'Twelve Tables', 'Justinian Code', 'Draconian Constitution'], answer: 'A' },
    { category: 'History', question: 'In which year did the Titanic sink?', options: ['1905', '1912', '1918', '1923'], answer: 'B' },
    { category: 'History', question: 'Who was the first female Prime Minister of the United Kingdom?', options: ['Theresa May', 'Margaret Thatcher', 'Indira Gandhi', 'Angela Merkel'], answer: 'B' },
    { category: 'History', question: 'Which empire was ruled by Julius Caesar?', options: ['Roman Empire', 'Grecian Empire', 'Byzantine Empire', 'Ottoman Empire'], answer: 'A' },
    { category: 'History', question: 'What was the name of the ancient trade route connecting China to the Mediterranean?', options: ['Incense Route', 'Amber Road', 'Silk Road', 'Spice Route'], answer: 'C' },
    { category: 'History', question: 'In which year did World War I begin?', options: ['1912', '1914', '1916', '1918'], answer: 'B' },
    { category: 'History', question: 'Who led the anti-apartheid movement in South Africa and became president in 1994?', options: ['Desmond Tutu', 'Thabo Mbeki', 'Nelson Mandela', 'Robert Mugabe'], answer: 'C' },
    { category: 'History', question: 'Which European country experienced the Renaissance first?', options: ['France', 'England', 'Germany', 'Italy'], answer: 'D' },
    { category: 'History', question: 'What event triggered the start of the Great Depression in 1929?', options: ['Wall Street Crash', 'Treaty of Versailles', 'World War I', 'Russian Revolution'], answer: 'A' },
    { category: 'History', question: 'Who was the last pharaoh of Ancient Egypt?', options: ['Nefertiti', 'Hatshepsut', 'Cleopatra VII', 'Cleopatra V'], answer: 'C' },
    { category: 'History', question: 'In which year did Christopher Columbus first reach the Americas?', options: ['1492', '1498', '1504', '1510'], answer: 'A' },
    { category: 'History', question: 'Which empire captured Constantinople in 1453, ending the Byzantine Empire?', options: ['Mongol Empire', 'Ottoman Empire', 'Persian Empire', 'Arab Caliphate'], answer: 'B' },
    { category: 'History', question: 'What document was signed in England in 1215 to limit the power of the king?', options: ['English Bill of Rights', 'Magna Carta', 'Petition of Right', 'Edict of Nantes'], answer: 'B' },
    { category: 'History', question: 'Who was the leader of the Soviet Union during World War II?', options: ['Vladimir Lenin', 'Joseph Stalin', 'Nikita Khrushchev', 'Leon Trotsky'], answer: 'B' },
    { category: 'History', question: 'The French Revolution began in which year?', options: ['1776', '1789', '1799', '1804'], answer: 'B' },
    { category: 'History', question: 'Which civilization developed the earliest known writing system, Cuneiform?', options: ['Sumerians', 'Egyptians', 'Indus Valley', 'Minoans'], answer: 'A' },
    { category: 'History', question: 'Which United States President issued the Emancipation Proclamation in 1863?', options: ['George Washington', 'Thomas Jefferson', 'Abraham Lincoln', 'Ulysses S. Grant'], answer: 'C' },
    { category: 'History', question: 'What was the main purpose of the Manhattan Project during World War II?', options: ['Radar development', 'Cracking the Enigma code', 'Developing atomic weapons', 'Designing long-range bombers'], answer: 'C' },
    { category: 'History', question: 'Which West African empire succeeded the Ghana Empire and preceded the Songhai Empire?', options: ['Mali Empire', 'Kanem-Bornu Empire', 'Oyo Empire', 'Ashanti Empire'], answer: 'A' },
    { category: 'History', question: 'Who was the principal author of the United States Declaration of Independence?', options: ['Benjamin Franklin', 'John Adams', 'Thomas Jefferson', 'Alexander Hamilton'], answer: 'C' },
    { category: 'History', question: 'Which conflict was fought between North Korea and South Korea from 1950 to 1953?', options: ['Vietnam War', 'Korean War', 'Sino-Japanese War', 'Cold War'], answer: 'B' },

    // TECHNOLOGY
    { category: 'Technology', question: 'What does ACID stand for in database transactions?', options: ['Atomicity Consistency Isolation Durability', 'Availability Consistency Isolation Distribution', 'Atomicity Concurrency Integrity Durability', 'Access Control Integrity Distribution'], answer: 'A' },
    { category: 'Technology', question: 'What is the worst-case time complexity of binary search on a sorted array?', options: ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)'], answer: 'B' },
    { category: 'Technology', question: 'Which HTTP status code means Too Many Requests?', options: ['401', '403', '409', '429'], answer: 'D' },
    { category: 'Technology', question: 'What does CPU stand for?', options: ['Central Processing Unit', 'Computer Power Unit', 'Central Program Utility', 'Control Processing Utility'], answer: 'A' },
    { category: 'Technology', question: 'What does HTML stand for?', options: ['HyperText Markup Language', 'HighText Machine Language', 'Hyper Transfer Markup Language', 'Home Tool Markup Language'], answer: 'A' },
    { category: 'Technology', question: 'Which company developed the Windows operating system?', options: ['Apple', 'Microsoft', 'Google', 'IBM'], answer: 'B' },
    { category: 'Technology', question: 'What does RAM stand for?', options: ['Read Access Memory', 'Random Access Memory', 'Rapid Action Memory', 'Remote Access Module'], answer: 'B' },
    { category: 'Technology', question: 'Which programming language is commonly used with Node.js?', options: ['Python', 'Java', 'JavaScript', 'C++'], answer: 'C' },
    { category: 'Technology', question: 'Which data structure follows the Last In, First Out (LIFO) principle?', options: ['Queue', 'Array', 'Tree', 'Stack'], answer: 'D' },
    { category: 'Technology', question: 'Who is credited with inventing the World Wide Web?', options: ['Bill Gates', 'Steve Jobs', 'Tim Berners-Lee', 'Linus Torvalds'], answer: 'C' },
    { category: 'Technology', question: 'What is the time complexity of binary search?', options: ['O(n)', 'O(n log n)', 'O(1)', 'O(log n)'], answer: 'D' },
    { category: 'Technology', question: 'Which of these is NOT a JavaScript framework or library?', options: ['React', 'Vue', 'Django', 'Angular'], answer: 'C' },
    { category: 'Technology', question: 'What is the result of the binary addition 1011 + 0110?', options: ['10001', '10101', '11001', '1111'], answer: 'A' },
    { category: 'Technology', question: 'What cryptographic protocol uses public and private key pairs for secure data transmission?', options: ['AES', 'RSA', 'MD5', 'SHA-256'], answer: 'B' },
    { category: 'Technology', question: 'In computer science, what does ACID stand for in the context of database transactions?', options: ['Atomicity, Consistency, Isolation, Durability', 'Access, Control, Integration, Distribution', 'Array, Cache, Index, Data', 'Asynchronous, Concurrent, Iterative, Distributed'], answer: 'A' },
    { category: 'Technology', question: 'Which sorting algorithm has a worst-case time complexity of O(n log n) under all conditions?', options: ['QuickSort', 'BubbleSort', 'MergeSort', 'InsertionSort'], answer: 'C' },
    { category: 'Technology', question: 'What network layer in the OSI model is responsible for routing packets across different networks?', options: ['Data Link Layer', 'Network Layer', 'Transport Layer', 'Application Layer'], answer: 'B' },
    { category: 'Technology', question: 'What architectural design pattern separates an application into Model, View, and Controller?', options: ['MVC', 'MVVM', 'MVP', 'Singleton'], answer: 'A' },
    { category: 'Technology', question: 'Which concurrency mechanism allows multiple threads to access a shared resource safely by locking it?', options: ['Semaphore / Mutex', 'Garbage Collector', 'Just-In-Time Compiler', 'Virtual DOM'], answer: 'A' },
    { category: 'Technology', question: 'What is the primary function of a hypervisor in cloud computing?', options: ['Managing network firewalls', 'Creating and running virtual machines', 'Compiling source code', 'Compressing database logs'], answer: 'B' },
    { category: 'Technology', question: 'What does IP stand for in networking?', options: ['Internal Protocol', 'Internet Protocol', 'Interface Provider', 'Information Process'], answer: 'B' },
    { category: 'Technology', question: 'Which port is used by default for HTTP traffic?', options: ['21', '22', '80', '443'], answer: 'C' },
    { category: 'Technology', question: 'What is the main operating system kernel created by Linus Torvalds?', options: ['Unix', 'Linux', 'BSD', 'Solaris'], answer: 'B' },
    { category: 'Technology', question: 'In version control systems like Git, what command merges changes from a remote repository into the current branch?', options: ['git commit', 'git push', 'git pull', 'git checkout'], answer: 'C' },
    { category: 'Technology', question: 'Which data structure follows the First In, First Out (FIFO) principle?', options: ['Stack', 'Queue', 'Graph', 'Binary Tree'], answer: 'B' },
    { category: 'Technology', question: 'What default port does HTTPS use for secure web communications?', options: ['25', '80', '8080', '443'], answer: 'D' },
    { category: 'Technology', question: 'Which programming language is primarily used for Android app development alongside Kotlin?', options: ['Swift', 'Java', 'C#', 'Ruby'], answer: 'B' },
    { category: 'Technology', question: 'What does CSS stand for?', options: ['Cascading Style Sheets', 'Computer Style System', 'Creative Sheet Structure', 'Condensed Style Syntax'], answer: 'A' },
    { category: 'Technology', question: 'In object-oriented programming, what is the term for creating a new class from an existing class?', options: ['Polymorphism', 'Encapsulation', 'Inheritance', 'Abstraction'], answer: 'C' },
    { category: 'Technology', question: 'Which database type uses tables with rows and columns and uses SQL for queries?', options: ['NoSQL', 'Relational Database (RDBMS)', 'Key-Value Store', 'Graph Database'], answer: 'B' },
    { category: 'Technology', question: 'What does SQL stand for?', options: ['Sequential Query Language', 'Structured Query Language', 'Standard System Query', 'Simple Quick Language'], answer: 'B' },
    { category: 'Technology', question: 'Which algorithm is widely used for finding the shortest path between nodes in a weighted graph?', options: ['Dijkstra\'s Algorithm', 'Kruskal\'s Algorithm', 'Floyd-Warshall', 'Breadth-First Search'], answer: 'A' },
    { category: 'Technology', question: 'What does DNS stand for in networking?', options: ['Domain Name System', 'Dynamic Network Service', 'Digital Name Structure', 'Data Network Storage'], answer: 'A' },
    { category: 'Technology', question: 'Which company created the Swift programming language for iOS development?', options: ['Google', 'Microsoft', 'Apple', 'Meta'], answer: 'C' },
    { category: 'Technology', question: 'What is the default port used by SSH (Secure Shell)?', options: ['20', '21', '22', '23'], answer: 'C' },
    { category: 'Technology', question: 'What technique in web development updates parts of a web page without reloading the entire page?', options: ['DOM Manipulation', 'AJAX', 'Server-Side Rendering', 'WebSockets'], answer: 'B' },
    { category: 'Technology', question: 'Which component in a modern computer performs graphics rendering and parallel processing?', options: ['CPU', 'GPU', 'RAM', 'SSD'], answer: 'B' },
    { category: 'Technology', question: 'In cybersecurity, what type of attack floods a server with excessive traffic to make it unavailable?', options: ['Phishing', 'Man-in-the-Middle', 'DDoS', 'SQL Injection'], answer: 'C' },
    { category: 'Technology', question: 'What protocol is used to automatically assign IP addresses to devices on a network?', options: ['DNS', 'DHCP', 'FTP', 'SMTP'], answer: 'B' },
    { category: 'Technology', question: 'What non-relational, document-oriented database is famous for using JSON-like documents?', options: ['PostgreSQL', 'MongoDB', 'SQLite', 'OracleDB'], answer: 'B' },

    // GENERAL KNOWLEDGE
    { category: 'General Knowledge', question: 'How many days are there in a leap year?', options: ['364', '365', '366', '367'], answer: 'C' },
    { category: 'General Knowledge', question: 'How many players does a football team have on the field at the start of a standard match?', options: ['9', '10', '11', '12'], answer: 'C' },
    { category: 'General Knowledge', question: 'Which instrument is commonly used to measure temperature?', options: ['Barometer', 'Thermometer', 'Hygrometer', 'Anemometer'], answer: 'B' },
    { category: 'General Knowledge', question: 'How many sides does a hexagon have?', options: ['5', '6', '7', '8'], answer: 'B' },
    { category: 'General Knowledge', question: 'Which planet is closest to the Sun?', options: ['Venus', 'Earth', 'Mercury', 'Mars'], answer: 'C' },
    { category: 'General Knowledge', question: 'What is the smallest country in the world by area?', options: ['Monaco', 'San Marino', 'Vatican City', 'Liechtenstein'], answer: 'C' },
    { category: 'General Knowledge', question: 'Which primary color mixed with blue creates green?', options: ['Red', 'Yellow', 'Purple', 'Orange'], answer: 'B' },
    { category: 'General Knowledge', question: 'How many rings are on the official Olympic flag?', options: ['4', '5', '6', '7'], answer: 'B' },
    { category: 'General Knowledge', question: 'What is the main currency used in Japan?', options: ['Yuan', 'Won', 'Yen', 'Ringgit'], answer: 'C' },
    { category: 'General Knowledge', question: 'Which animal is known as the "Ship of the Desert"?', options: ['Horse', 'Camel', 'Llama', 'Elephant'], answer: 'B' },
    { category: 'General Knowledge', question: 'How many colors are in a standard rainbow?', options: ['5', '6', '7', '8'], answer: 'C' },
    { category: 'General Knowledge', question: 'Which continent has the largest human population?', options: ['Africa', 'Europe', 'North America', 'Asia'], answer: 'D' },
    { category: 'General Knowledge', question: 'What is the hardest substance found in the human body?', options: ['Bone', 'Tooth enamel', 'Cartilage', 'Nail'], answer: 'B' },
    { category: 'General Knowledge', question: 'In chess, which piece can move diagonally across the board?', options: ['Rook', 'Knight', 'Bishop', 'Pawn'], answer: 'C' },
    { category: 'General Knowledge', question: 'How many zeros are in the number one million?', options: ['5', '6', '7', '8'], answer: 'B' },
    { category: 'General Knowledge', question: 'Which language has the most native speakers worldwide?', options: ['English', 'Spanish', 'Mandarin Chinese', 'Hindi'], answer: 'C' },
    { category: 'General Knowledge', question: 'What is the highest-scoring title in a standard game of Scrabble without multipliers?', options: ['Bingo', 'Grandmaster', 'Jackpot', 'Royal'], answer: 'A' },
    { category: 'General Knowledge', question: 'Which country invented paper money?', options: ['Greece', 'Egypt', 'China', 'Rome'], answer: 'C' },
    { category: 'General Knowledge', question: 'What is the name of the highest mountain above sea level on Earth?', options: ['K2', 'Kilimanjaro', 'Mount Everest', 'Denali'], answer: 'C' },
    { category: 'General Knowledge', question: 'Which organ in the human body filters blood and produces urine?', options: ['Liver', 'Kidneys', 'Spleen', 'Pancreas'], answer: 'B' },
    { category: 'General Knowledge', question: 'How many classical musical notes are in a standard octave scale?', options: ['7', '8', '12', '10'], answer: 'A' },
    { category: 'General Knowledge', question: 'Which bird is famous for being incapable of flight and native to New Zealand?', options: ['Penguin', 'Ostrich', 'Kiwi', 'Emu'], answer: 'C' },
    { category: 'General Knowledge', question: 'What is the chemical formula for ordinary table salt?', options: ['NaCl', 'H2O', 'CO2', 'KCl'], answer: 'A' },
    { category: 'General Knowledge', question: 'Which element does "O" represent on the periodic table?', options: ['Osmium', 'Oxygen', 'Oganesson', 'Oxide'], answer: 'B' },
    { category: 'General Knowledge', question: 'What is the standard length of an Olympic swimming pool?', options: ['25 meters', '50 meters', '75 meters', '100 meters'], answer: 'B' },
    { category: 'General Knowledge', question: 'Which instrument uses a keyboard, bellows, and reeds?', options: ['Accordion', 'Organ', 'Harmonica', 'Piano'], answer: 'A' },
    { category: 'General Knowledge', question: 'What is the largest mammal currently living on Earth?', options: ['African Elephant', 'Blue Whale', 'Colossal Squid', 'Giraffe'], answer: 'B' },
    { category: 'General Knowledge', question: 'Which country is home to the ancient landmark Machu Picchu?', options: ['Mexico', 'Chile', 'Peru', 'Brazil'], answer: 'C' },
    { category: 'General Knowledge', question: 'In geometry, what is the term for a polygon with eight sides?', options: ['Hexagon', 'Heptagon', 'Octagon', 'Decagon'], answer: 'C' },
    { category: 'General Knowledge', question: 'What is the freezing point of water in degrees Celsius?', options: ['-10°C', '0°C', '32°C', '100°C'], answer: 'B' },
    { category: 'General Knowledge', question: 'Which piece of sports equipment is struck using a cue stick?', options: ['Bowling ball', 'Billiard ball', 'Cricket ball', 'Golf ball'], answer: 'B' },
    { category: 'General Knowledge', question: 'What color are the stars on the national flag of the United States?', options: ['Red', 'Blue', 'White', 'Yellow'], answer: 'C' },
    { category: 'General Knowledge', question: 'How many minutes are in a full hour?', options: ['30', '45', '60', '100'], answer: 'C' },
    { category: 'General Knowledge', question: 'Which fruit is famous for having its seeds on the outside skin?', options: ['Raspberry', 'Strawberry', 'Fig', 'Blueberry'], answer: 'B' },
    { category: 'General Knowledge', question: 'What is the national flower of Japan, celebrated during spring festivals?', options: ['Rose', 'Tulip', 'Cherry Blossom (Sakura)', 'Orchid'], answer: 'C' },
    { category: 'General Knowledge', question: 'Which famous clock tower is located at the north end of the Palace of Westminster in London?', options: ['Big Ben', 'Eiffel Tower', 'Leaning Tower', 'Spire of Dublin'], answer: 'A' },

   // GAMING
    { category: 'Gaming', question: 'In which game do players compete in a battle royale on an island called Erangel?', options: ['Fortnite', 'PUBG', 'Apex Legends', 'Call of Duty: Warzone'], answer: 'B' },
    { category: 'Gaming', question: 'Which game features a character named Link who must rescue Princess Zelda?', options: ['Final Fantasy', 'The Legend of Zelda', 'Metroid', 'Super Mario Bros.'], answer: 'B' },
    { category: 'Gaming', question: 'In which game do players build and explore blocky worlds made of cubes?', options: ['Roblox', 'Minecraft', 'Terraria', 'Fortnite'], answer: 'B' },
    { category: 'Gaming', question: 'Who is the main protagonist of the God of War series?', options: ['Zeus', 'Kratos', 'Ares', 'Atreus'], answer: 'B' },
    { category: 'Gaming', question: 'Which company developed the Game Boy console released in 1989?', options: ['Sega', 'Sony', 'Nintendo', 'Atari'], answer: 'C' },
    { category: 'Gaming', question: 'In GTA V, which three characters serve as the main playable protagonists?', options: ['Niko, Roman, CJ', 'Michael, Trevor, Franklin', 'Tommy, Claude, CJ', 'Arthur, John, Dutch'], answer: 'B' },
    { category: 'Gaming', question: 'Which video game character is famous for eating dots and running from ghosts like Blinky and Inky?', options: ['Q*bert', 'Pac-Man', 'Dig Dug', 'Mega Man'], answer: 'B' },
    { category: 'Gaming', question: 'In FIFA/EA Sports FC, what does FUT stand for?', options: ['Football Ultimate Team', 'Federation Ultimate Tournament', 'Football Universal Tactics', 'First Ultimate Team'], answer: 'A' },
    { category: 'Gaming', question: 'Which company created the video game engine Unreal Engine?', options: ['Unity Technologies', 'Epic Games', 'Valve', 'Crytek'], answer: 'B' },
    { category: 'Gaming', question: 'What is the highest-selling video game of all time?', options: ['Tetris', 'Grand Theft Auto V', 'Minecraft', 'Wii Sports'], answer: 'C' },
    { category: 'Gaming', question: 'Which iconic FPS game released in 1993 was created by id Software?', options: ['Quake', 'Doom', 'Wolfenstein 3D', 'Duke Nukem'], answer: 'B' },
    { category: 'Gaming', question: 'In League of Legends, what is the primary objective to win a standard match?', options: ['Kill the Baron', 'Destroy the Nexus', 'Capture the Flag', 'Eliminate all enemies'], answer: 'B' },
    { category: 'Gaming', question: 'What is the name of the main fictional city in Grand Theft Auto: San Andreas?', options: ['Liberty City', 'Vice City', 'Los Santos', 'San Fierro'], answer: 'C' },
    { category: 'Gaming', question: 'Which RPG series developed by CD Projekt Red features the witcher Geralt of Rivia?', options: ['The Elder Scrolls', 'The Witcher', 'Dark Souls', 'Dragon Age'], answer: 'B' },
    { category: 'Gaming', question: 'In Counter-Strike, what is the default code used to plant the bomb?', options: ['7355608', '1234567', '0000000', '9999999'], answer: 'A' },
    { category: 'Gaming', question: 'Who is the primary antagonist in the Super Mario series?', options: ['Wario', 'Walugi', 'Bowser', 'Donkey Kong'], answer: 'C' },
    { category: 'Gaming', question: 'Which game popularized the battle royale genre with a 100-player drop onto an island in 2017?', options: ['PUBG', 'H1Z1', 'Fortnite', 'Apex Legends'], answer: 'A' },
    { category: 'Gaming', question: 'What is the name of Master Chief\'s AI companion in the Halo series?', options: ['Cortana', 'Siri', 'Alexa', 'GLaDOS'], answer: 'A' },
    { category: 'Gaming', question: 'In Among Us, what is the title given to players attempting to sabotage the crew?', options: ['Traitor', 'Impostor', 'Alien', 'Infiltrator'], answer: 'B' },
    { category: 'Gaming', question: 'Which video game franchise features the phrase "War. War never changes."?', options: ['Call of Duty', 'Battlefield', 'Fallout', 'Gears of War'], answer: 'C' },
    { category: 'Gaming', question: 'What video game features a portal gun developed by Aperture Science?', options: ['Half-Life', 'Portal', 'BioShock', 'Overwatch'], answer: 'B' },
    { category: 'Gaming', question: 'Which company released the PlayStation console in 1994?', options: ['Sega', 'Nintendo', 'Sony', 'Microsoft'], answer: 'C' },
    { category: 'Gaming', question: 'In Skyrim, what dragon language phrase translates to "Force Push"?', options: ['Fus Ro Dah', 'Yol Toor Shul', 'Wuld Nah Kest', 'Lok Vah Koor'], answer: 'A' },
    { category: 'Gaming', question: 'Which game features the island village inhabited by anthropomorphic animals in real-time simulation?', options: ['The Sims', 'Animal Crossing', 'Stardew Valley', 'Harvest Moon'], answer: 'B' },
    { category: 'Gaming', question: 'What is the title of Arthur Morgan\'s story in the Red Dead series?', options: ['Red Dead Revolver', 'Red Dead Redemption', 'Red Dead Redemption 2', 'Red Dead Online'], answer: 'C' },
    { category: 'Gaming', question: 'Which iconic fighting game features characters like Ryu, Ken, and Chun-Li?', options: ['Tekken', 'Mortal Kombat', 'Street Fighter', 'Super Smash Bros.'], answer: 'C' },
    { category: 'Gaming', question: 'In Pokémon, which type is super effective against Water-type Pokémon?', options: ['Fire', 'Electric', 'Rock', 'Ground'], answer: 'B' },
    { category: 'Gaming', question: 'What company developed Fortnite?', options: ['Riot Games', 'Blizzard', 'Epic Games', 'Respawn Entertainment'], answer: 'C' },
    { category: 'Gaming', question: 'In Clash of Clans, what resource is used to train normal troops and upgrade buildings?', options: ['Gems', 'Gold', 'Elixir', 'Dark Elixir'], answer: 'C' },
    { category: 'Gaming', question: 'Which game won Game of the Year at The Game Awards 2022?', options: ['Elden Ring', 'God of War Ragnarök', 'Horizon Forbidden West', 'Stray'], answer: 'A' },
    { category: 'Gaming', question: 'What is the primary currency used in Roblox?', options: ['V-Bucks', 'Robux', 'Minecoins', 'Gems'], answer: 'B' },
    { category: 'Gaming', question: 'Which Sega mascot made his debut in 1991 to compete directly with Mario?', options: ['Sonic the Hedgehog', 'Tails', 'Knuckles', 'Alex Kidd'], answer: 'A' },
    { category: 'Gaming', question: 'What is the name of the main setting in the Bioshock series\' first two games?', options: ['Columbia', 'Rapture', 'Dunwall', 'Yharnam'], answer: 'B' },

    // ANIME
    { category: 'Anime', question: 'What is the name of the pirate crew led by Monkey D. Luffy?', options: ['Red Hair Pirates', 'Blackbeard Pirates', 'Heart Pirates', 'Straw Hat Pirates'], answer: 'D' },
    { category: 'Anime', question: 'In "Naruto," what is the name of Naruto\'s signature jutsu?', options: ['Chidori', 'Rasengan', 'Amaterasu', 'Susanoo'], answer: 'B' },
    { category: 'Anime', question: 'In "Attack on Titan," what is the name of the city where the story begins?', options: ['Shiganshina', 'Trost', 'Mitras', 'Wall Rose'], answer: 'A' },
    { category: 'Anime', question: 'In "My Hero Academia," what is the name of the protagonist who dreams of becoming a hero?', options: ['Katsuki Bakugo', 'Izuku Midoriya', 'Shoto Todoroki', 'All Might'], answer: 'B' },
    { category: 'Anime', question: 'In "Demon Slayer," what is the name of Tanjiro\'s sister who was turned into a demon?', options: ['Nezuko Kamado', 'Kanao Tsuyuri', 'Shinobu Kocho', 'Mitsuri Kanroji'], answer: 'A' },
    { category: 'Anime', question: 'What is the name of the main protagonist in Death Note?', options: ['L Lawliet', 'Light Yagami', 'Ryuk', 'Misa Amane'], answer: 'B' },
    { category: 'Anime', question: 'Which village does Naruto Uzumaki belong to at the beginning of the series?', options: ['Hidden Sand Village', 'Hidden Mist Village', 'Hidden Leaf Village', 'Hidden Cloud Village'], answer: 'C' },
    { category: 'Anime', question: 'What is the name of Goku\'s signature energy attack in Dragon Ball?', options: ['Spirit Bomb', 'Final Flash', 'Kamehameha', 'Makankosappo'], answer: 'C' },
    { category: 'Anime', question: 'In Attack on Titan, what is the primary name of the military branch that explores outside the walls?', options: ['Garrison Regiment', 'Survey Corps', 'Military Police Brigade', 'Training Corps'], answer: 'B' },
    { category: 'Anime', question: 'Which studio produced the acclaimed anime film Spirited Away?', options: ['Kyoto Animation', 'Ufotable', 'Studio Ghibli', 'Madhouse'], answer: 'C' },
    { category: 'Anime', question: 'What is the name of the legendary treasure sought after by pirates in One Piece?', options: ['All Blue', 'One Piece', 'Poneglyph', 'Laugh Tale'], answer: 'B' },
    { category: 'Anime', question: 'Which anime features the sport of volleyball prominently?', options: ['Blue Lock', 'Slam Dunk', 'Haikyuu!!', 'Kuroko\'s Basketball'], answer: 'C' },
    { category: 'Anime', question: 'What is the name of the alchemist brother who lost an arm and a leg in Fullmetal Alchemist?', options: ['Alphonse Elric', 'Edward Elric', 'Van Hohenheim', 'Roy Mustang'], answer: 'B' },
    { category: 'Anime', question: 'In Demon Slayer, what is the family name of the main characters Tanjiro and Nezuko?', options: ['Agatsuma', 'Hashibira', 'Kamado', 'Tomioka'], answer: 'C' },
    { category: 'Anime', question: 'What is the name of the school where aspiring heroes train in My Hero Academia?', options: ['Shikoku Academy', 'Ketsutsu Academy', 'U.A. High School', 'Isawa High'], answer: 'C' },
    { category: 'Anime', question: 'Which anime series follows Tanjiro Kamado joining the Demon Slayer Corps to find a cure for his sister?', options: ['Bleach', 'Demon Slayer: Kimetsu no Yaiba', 'Jujutsu Kaisen', 'Chainsaw Man'], answer: 'B' },
    { category: 'Anime', question: 'What is the name of the virtual reality MMORPG where players get trapped in the first arc of Sword Art Online?', options: ['Alfheim Online', 'Gun Gale Online', 'Sword Art Online', 'Aincrad'], answer: 'C' },
    { category: 'Anime', question: 'Who is the creator of the long-running adventure manga One Piece?', options: ['Masashi Kishimoto', 'Akira Toriyama', 'Eiichiro Oda', 'Tite Kubo'], answer: 'C' },
    { category: 'Anime', question: 'What type of creature is Happosai or Shippo in classic folklore, though represented as a demon fox in Naruto?', options: ['Dragon', 'Kitsune', 'Tanuki', 'Oni'], answer: 'B' },
    { category: 'Anime', question: 'In Tokyo Ghoul, what is the name of the protagonist who becomes a half-ghoul?', options: ['Koutaro Amon', 'Juuzou Suzuya', 'Ken Kaneki', 'Renji Yomo'], answer: 'C' },
    { category: 'Anime', question: 'What is the name of Ichigo Kurosaki\'s primary weapon (Zanpakuto) in Bleach?', options: ['Zangetsu', 'Senbonzakura', 'Kyoka Suigetsu', 'Tensa Zangetsu'], answer: 'A' },
    { category: 'Anime', question: 'Which anime features characters fighting using supernatural abilities known as "Quirks"?', options: ['Hunter x Hunter', 'My Hero Academia', 'Jujutsu Kaisen', 'Black Clover'], answer: 'B' },
    { category: 'Anime', question: 'What is the name of the town where most of the bizarre events take place in JoJo\'s Bizarre Adventure: Diamond is Unbreakable?', options: ['Cairo', 'Morioh', 'New York', 'London'], answer: 'B' },
    { category: 'Anime', question: 'In Dragon Ball Z, who is the first character to achieve the Super Saiyan transformation during the Frieza saga?', options: ['Vegeta', 'Gohan', 'Goku', 'Trunks'], answer: 'C' },
    { category: 'Anime', question: 'What is the name of the futuristic bounty-hunting spaceship in Cowboy Bebop?', options: ['Excalibur', 'Bebop', 'Normandyy', 'Outlaw Star'], answer: 'B' },
    { category: 'Anime', question: 'In "Jujutsu Kaisen," what is the name of the cursed object ingested by Yuji Itadori?', options: ['Sukuna\'s Finger', 'Rikugan Eye', 'Prison Realm', 'Cursed Orb'], answer: 'A' },
    { category: 'Anime', question: 'What magic system is used by Hunters in "Hunter x Hunter"?', options: ['Mana', 'Chakra', 'Nen', 'Ki'], answer: 'C' },
    { category: 'Anime', question: 'Who is the "One Punch Man" in the anime series of the same name?', options: ['Genos', 'Saitama', 'Mumen Rider', 'Bang'], answer: 'B' },
    { category: 'Anime', question: 'In "Chainsaw Man," what is the name of Denji\'s Devil dog companion?', options: ['Pochita', 'Power', 'Kon', 'Aki'], answer: 'A' },
    { category: 'Anime', question: 'Which anime series features a giant humanoid mechanical robot named EVA-01?', options: ['Code Geass', 'Neon Genesis Evangelion', 'Mobile Suit Gundam', 'Gurren Lagann'], answer: 'B' },
    { category: 'Anime', question: 'What is the name of the guild that Natsu Dragneel belongs to in "Fairy Tail"?', options: ['Sabertooth', 'Blue Pegasus', 'Fairy Tail', 'Phantom Lord'], answer: 'C' },
    { category: 'Anime', question: 'In "Steins;Gate," what household appliance is modified to send text messages back in time?', options: ['Toaster', 'Microwave', 'Refrigerator', 'Coffee Maker'], answer: 'B' },
    { category: 'Anime', question: 'Who is the main protagonist of "Mob Psycho 100"?', options: ['Reigen Arataka', 'Shigeo Kageyama', 'Ritsu Kageyama', 'Teruki Hanazawa'], answer: 'B' },
    { category: 'Anime', question: 'In "Spy x Family," what secret ability does Anya Forger possess?', options: ['Super Strength', 'Invisibility', 'Telepathy', 'Teleportation'], answer: 'C' },
    { category: 'Anime', question: 'Which Devil Fruit did Monkey D. Luffy eat in "One Piece"?', options: ['Mera Mera no Mi', 'Gomu Gomu no Mi', 'Ope Ope no Mi', 'Yami Yami no Mi'], answer: 'B' },

    // SPORTS
    { category: 'Sports', question: 'Which country has won the most FIFA World Cup titles?', options: ['Germany', 'Argentina', 'Brazil', 'Italy'], answer: 'C' },
    { category: 'Sports', question: 'Who is the all-time top goalscorer in the UEFA Champions League?', options: ['Lionel Messi', 'Cristiano Ronaldo', 'Robert Lewandowski', 'Karim Benzema'], answer: 'B' },
    { category: 'Sports', question: 'Which club won the Premier League in the 2003–04 season without losing a single match?', options: ['Manchester United', 'Chelsea', 'Arsenal', 'Liverpool'], answer: 'C' },
    { category: 'Sports', question: 'Who won the FIFA Men\'s World Cup in 2022?', options: ['France', 'Argentina', 'Croatia', 'Brazil'], answer: 'B' },
    { category: 'Sports', question: 'Which player has won the most Ballon d\'Or awards in history?', options: ['Cristiano Ronaldo', 'Johan Cruyff', 'Lionel Messi', 'Michel Platini'], answer: 'C' },
    { category: 'Sports', question: 'What is the standard length of a professional football match, excluding extra time?', options: ['80 minutes', '90 minutes', '100 minutes', '120 minutes'], answer: 'B' },
    { category: 'Sports', question: 'Which country hosted the first-ever FIFA World Cup in 1930?', options: ['Brazil', 'Uruguay', 'Italy', 'Argentina'], answer: 'B' },
    { category: 'Sports', question: 'Which player is nicknamed "The Phenomenon" (El Fenómeno)?', options: ['Ronaldinho', 'Ronaldo Nazário', 'Cristiano Ronaldo', 'Romário'], answer: 'B' },
    { category: 'Sports', question: 'Which African nation was the first to reach a FIFA World Cup semi-final?', options: ['Cameroon', 'Senegal', 'Ghana', 'Morocco'], answer: 'D' },
    { category: 'Sports', question: 'What distance is a penalty kick taken from in standard football?', options: ['10 yards', '12 yards', '15 yards', '18 yards'], answer: 'B' },
    { category: 'Sports', question: 'Which English football club is known as "The Red Devils"?', options: ['Liverpool', 'Manchester United', 'Arsenal', 'Nottingham Forest'], answer: 'B' },
    { category: 'Sports', question: 'Who scored the famous "Hand of God" goal in the 1986 World Cup?', options: ['Pelé', 'Diego Maradona', 'Zinedine Zidane', 'Marco van Basten'], answer: 'B' },
    { category: 'Sports', question: 'Which stadium is known as "The Theatre of Dreams"?', options: ['Anfield', 'Old Trafford', 'Wembley Stadium', 'San Siro'], answer: 'B' },
    { category: 'Sports', question: 'Which country won the UEFA European Championship (Euro) in 2004 as major underdogs?', options: ['Portugal', 'Greece', 'Denmark', 'Czech Republic'], answer: 'B' },
    { category: 'Sports', question: 'Who holds the record for the highest transfer fee in football history?', options: ['Kylian Mbappé', 'Neymar Jr.', 'Philippe Coutinho', 'Jude Bellingham'], answer: 'B' },
    { category: 'Sports', question: 'Which manager won three consecutive UEFA Champions League titles with Real Madrid?', options: ['Pep Guardiola', 'Carlo Ancelotti', 'Zinedine Zidane', 'José Mourinho'], answer: 'C' },
    { category: 'Sports', question: 'How many players per team are on the field at the start of a standard football match?', options: ['10', '11', '12', '15'], answer: 'B' },
    { category: 'Sports', question: 'Which club is famously known as "Der FCB" in Germany?', options: ['Borussia Dortmund', 'Bayern Munich', 'Bayer Leverkusen', 'RB Leipzig'], answer: 'B' },
    { category: 'Sports', question: 'Who was the top goalscorer at the 2014 FIFA World Cup in Brazil?', options: ['Thomas Müller', 'James Rodríguez', 'Lionel Messi', 'Neymar Jr.'], answer: 'B' },
    { category: 'Sports', question: 'Which national team is known as the "Super Eagles"?', options: ['Ghana', 'Cameroon', 'Nigeria', 'Ivory Coast'], answer: 'C' },
    { category: 'Sports', question: 'Which country won the FIFA World Cup in 2018?', options: ['Germany', 'Brazil', 'France', 'Argentina'], answer: 'C' },
    { category: 'Sports', question: 'In which sport is the term "love" used to indicate a score of zero?', options: ['Tennis', 'Badminton', 'Squash', 'Table Tennis'], answer: 'A' },
    { category: 'Sports', question: 'Which athlete is known as "The Fastest Man Alive"?', options: ['Usain Bolt', 'Carl Lewis', 'Michael Johnson', 'Tyson Gay'], answer: 'A' },
    { category: 'Sports', question: 'In which sport would you perform a slam dunk?', options: ['Basketball', 'Volleyball', 'Handball', 'Netball'], answer: 'A' },
    { category: 'Sports', question: 'Which country hosted the 2016 Summer Olympics?', options: ['China', 'Brazil', 'United Kingdom', 'Russia'], answer: 'B' },
    { category: 'Sports', question: 'Which sport is known as the "king of sports"?', options: ['Soccer', 'Basketball', 'Cricket', 'Tennis'], answer: 'A' },
    { category: 'Sports', question: 'In which sport do players use a shuttlecock?', options: ['Badminton', 'Tennis', 'Squash', 'Table Tennis'], answer: 'A' },
    { category: 'Sports', question: 'Which country has won the most Olympic gold medals in history?', options: ['United States', 'Soviet Union', 'China', 'Germany'], answer: 'A' },
    { category: 'Sports', question: 'In which sport does a birdie mean one stroke under par?', options: ['Golf', 'Tennis', 'Badminton', 'Cricket'], answer: 'A' },
    { category: 'Sports', question: 'Which sport is played on a field with 11 players on each team and a round ball?', options: ['Soccer', 'Rugby', 'American Football', 'Field Hockey'], answer: 'A' },

    // ENTERTAINMENT
    { category: 'Entertainment', question: 'Which 2019 film directed by Bong Joon-ho became the first South Korean movie to win the Academy Award for Best Picture?', options: ['Train to Busan', 'Parasite', 'The Handmaiden', 'Memories of Murder'], answer: 'B' },
    { category: 'Entertainment', question: 'In the iconic 2016 zombie thriller "Train to Busan", what vehicle serves as the primary setting for the survival story?', options: ['A subway train', 'A high-speed KTX train', 'An interstate bus', 'An airplane'], answer: 'B' },
    { category: 'Entertainment', question: 'Which actor played the lead role of Oh Dae-su in Park Chan-wook\'s famous 2003 psychological thriller "Oldboy"?', options: ['Choi Min-sik', 'Song Kang-ho', 'Lee Byung-hun', 'Gong Yoo'], answer: 'A' },
    { category: 'Entertainment', question: 'Which 2016 psychological thriller directed by Na Hong-jin centers on a mysterious sickness spreading through a remote mountain village?', options: ['I Saw the Devil', 'The Wailing', 'Burning', 'A Tale of Two Sisters'], answer: 'B' },
    { category: 'Entertainment', question: 'Which 2016 period thriller directed by Park Chan-wook was adapted from Sarah Waters\' novel "Fingersmith"?', options: ['Decision to Leave', 'The Handmaiden', 'Thirst', 'Lady Vengeance'], answer: 'B' },
    { category: 'Entertainment', question: 'Actor Song Kang-ho starred as a taxi driver in which 2017 historical drama based on the 1980 Gwangju Uprising?', options: ['A Taxi Driver', '1987: When the Day Comes', 'The Host', 'Silmido'], answer: 'A' },
    { category: 'Entertainment', question: 'Which 2018 mystery drama film starring Yoo Ah-in and Steven Yeun was based on a short story by Haruki Murakami?', options: ['Burning', 'Drive My Car', 'Broker', 'Past Lives'], answer: 'A' },
    { category: 'Entertainment', question: 'In Bong Joon-ho\'s 2006 monster movie "The Host", where does the giant mutated creature emerge from?', options: ['The Yellow Sea', 'The Han River', 'A subway station', 'Mt. Bukhansan'], answer: 'B' },
    { category: 'Entertainment', question: 'Which 2022 romantic mystery film starring Park Hae-il and Tang Wei won Best Director for Park Chan-wook at the Cannes Film Festival?', options: ['Decision to Leave', 'Broker', 'Emergency Declaration', 'Hunt'], answer: 'A' },
    { category: 'Entertainment', question: 'Which 2019 action-comedy about undercover narcotics detectives operating a fried chicken restaurant became one of the highest-grossing South Korean films in history?', options: ['Extreme Job', 'Midnight Runners', 'Veteran', 'The Outlaws'], answer: 'A' },
    { category: 'Entertainment', question: 'In the Marvel Cinematic Universe, what metal is Captain America\'s shield composed of?', options: ['Adamantium', 'Vibranium', 'Uru', 'Titanium'], answer: 'B' },
    { category: 'Entertainment', question: 'Which director directed the iconic 1994 film "Pulp Fiction"?', options: ['Steven Spielberg', 'Christopher Nolan', 'Quentin Tarantino', 'Martin Scorsese'], answer: 'C' },
    { category: 'Entertainment', question: 'In "Avengers: Endgame", which character sacrifices themselves on Vormir to retrieve the Soul Stone?', options: ['Black Widow (Natasha Romanoff)', 'Gamora', 'Nebula', 'Scarlet Witch'], answer: 'A' },
    { category: 'Entertainment', question: 'Which 1997 James Cameron epic became the first film to surpass $1 billion at the box office worldwide?', options: ['Avatar', 'Titanic', 'Jurassic Park', 'Star Wars: The Force Awakens'], answer: 'B' },
    { category: 'Entertainment', question: 'Who played the role of the Joker in Christopher Nolan\'s 2008 superhero masterpiece "The Dark Knight"?', options: ['Joaquin Phoenix', 'Jared Leto', 'Jack Nicholson', 'Heath Ledger'], answer: 'D' },
    { category: 'Entertainment', question: 'Which fictional kingdom is the home of the Black Panther in the Marvel Cinematic Universe?', options: ['Genosha', 'Wakanda', 'Latveria', 'Sokovia'], answer: 'B' },
    { category: 'Entertainment', question: 'Which movie won the Academy Award for Best Picture in 2024 at the 96th Oscars?', options: ['Barbie', 'Oppenheimer', 'Poor Things', 'Killers of the Flower Moon'], answer: 'B' },
    { category: 'Entertainment', question: 'What is the name of the wizarding school attended by Harry Potter in the famous film series?', options: ['Beauxbatons', 'Durmstrang', 'Hogwarts', 'Ilvermorny'], answer: 'C' },
    { category: 'Entertainment', question: 'In the film "Inception", what object serves as Cobb\'s personal totem to determine if he is in a dream?', options: ['A loaded die', 'A spinning top', 'A chess piece', 'A silver coin'], answer: 'B' },
    { category: 'Entertainment', question: 'Which Marvel Cinematic Universe film launched the franchise in 2008?', options: ['The Incredible Hulk', 'Iron Man', 'Thor', 'Captain America: The First Avenger'], answer: 'B' },

    // RIDDLES
    { category: 'Riddles', question: 'I speak without a mouth and hear without ears. I have no body, but I come alive with sound. What am I?', options: ['An echo', 'A cloud', 'A shadow', 'A whistle'], answer: 'A' },
    { category: 'Riddles', question: 'The more of this there is, the less you see. What is it?', options: ['Fog', 'Darkness', 'Silence', 'Light'], answer: 'B' },
    { category: 'Riddles', question: 'What has to be broken before you can use it?', options: ['A coconut', 'A glass', 'An egg', 'A glowstick'], answer: 'C' },
    { category: 'Riddles', question: 'I am tall when I am young, and I am short when I am old. What am I?', options: ['A tree', 'A candle', 'A pencil', 'A shadow'], answer: 'B' },
    { category: 'Riddles', question: 'What month of the year has 28 days?', options: ['Only February', 'February and March', 'All of them', 'None of them'], answer: 'C' },
    { category: 'Riddles', question: 'What is full of holes but still holds water?', options: ['A net', 'A sponge', 'A sieve', 'A bucket'], answer: 'B' },
    { category: 'Riddles', question: 'What question can you never answer yes to?', options: ['Are you happy?', 'Are you asleep yet?', 'Is it raining?', 'Can you hear me?'], answer: 'B' },
    { category: 'Riddles', question: 'What is always in front of you but cannot be seen?', options: ['The past', 'The future', 'Air', 'Your reflection'], answer: 'B' },
    { category: 'Riddles', question: 'There is a one-story house in which everything is yellow. What color are the stairs?', options: ['Yellow', 'White', 'There are no stairs', 'Blue'], answer: 'C' },
    { category: 'Riddles', question: 'What can you break, even if you never pick it up or touch it?', options: ['A promise', 'A glass', 'A mirror', 'A shadow'], answer: 'A' },
    { category: 'Riddles', question: 'What goes up but never comes down?', options: ['An elevator', 'Smoke', 'Your age', 'A balloon'], answer: 'C' },
    { category: 'Riddles', question: 'A man who was outside in the rain without an umbrella or hat didn\'t get a single hair on his head wet. Why?', options: ['He was inside a car', 'He was bald', 'The rain stopped', 'He ran very fast'], answer: 'B' },
    { category: 'Riddles', question: 'What gets wet while drying?', options: ['A towel', 'A sponge', 'A mop', 'A shirt'], answer: 'A' },
    { category: 'Riddles', question: 'What can you keep after giving it to someone?', options: ['Your money', 'Your word', 'A gift', 'A secret'], answer: 'B' },
    { category: 'Riddles', question: 'I shave every day, but my beard stays the same. What am I?', options: ['A barber', 'A sheep', 'A razor', 'A mirror'], answer: 'A' },
    { category: 'Riddles', question: 'I have branches, but no fruit, trunk or leaves. What am I?', options: ['A dead tree', 'A bank', 'A river', 'A roadmap'], answer: 'B' },
    { category: 'Riddles', question: 'What has hands, but cannot clap?', options: ['A statue', 'A clock', 'A crab', 'A robot'], answer: 'B' },
    { category: 'Riddles', question: 'What has a head and a tail that is only made of metal, but no body?', options: ['A nail', 'A coin', 'A needle', 'A key'], answer: 'B' },
    { category: 'Riddles', question: 'What has many keys but can\'t open a single lock?', options: ['A map', 'A piano', 'A computer keyboard', 'A safe'], answer: 'B' },
    { category: 'Riddles', question: 'What can travel all around the world while remaining stuck in a corner?', options: ['A postcard', 'A stamp', 'A compass', 'A satellite'], answer: 'B' }
]


// Validate questions before a match starts.
function validateQuestions() {
    for (const [index, q] of questions.entries()) {
        if (
            !q.category ||
            !q.question ||
            !Array.isArray(q.options) ||
            q.options.length !== 4 ||
            !['A', 'B', 'C', 'D'].includes(q.answer)
        ) {
            throw new Error(`Invalid quiz question at index ${index}`);
        }
    }
}

validateQuestions();

// Select questions without repetition.
function selectQuestions(count = 10, platform = null, communityId = null) {
    if (!Number.isInteger(count) || count < 1 || count > questions.length) {
        throw new Error('Invalid quiz question count.');
    }

    const shuffled = questions.map(q=>({...q, id:crypto.createHash('sha256').update(q.category+'\0'+q.question).digest('hex').slice(0,24)}));

    // Fisher-Yates shuffle using crypto randomness.
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);

        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    if(platform && communityId) {
      const history=db.prepare('SELECT question_key,last_used FROM quiz_question_history WHERE platform=? AND community_id=?').all(platform,communityId);
      const used=new Map(history.map(x=>[x.question_key,x.last_used]));
      // Random tie-breaking, least recently played first after the bank is exhausted.
      shuffled.sort((a,b)=>(used.get(a.id)||0)-(used.get(b.id)||0));
      const save=db.prepare('INSERT INTO quiz_question_history(platform,community_id,question_key,last_used) VALUES(?,?,?,?) ON CONFLICT(platform,community_id,question_key) DO UPDATE SET last_used=excluded.last_used');
      const now=Date.now();
      // Actual selected questions are persisted after both difficulty pools are chosen.
      var historySaver={save,now};
    }
    const hard=shuffled.filter(q=>q.difficulty==='Hard');
    const other=shuffled.filter(q=>q.difficulty!=='Hard');
    const hardCount=Math.min(hard.length,Math.floor(count*0.3));
    const selected=[...hard.slice(0,hardCount),...other.slice(0,count-hardCount)];
    for(let i=selected.length-1;i>0;i--){const j=crypto.randomInt(i+1);[selected[i],selected[j]]=[selected[j],selected[i]];}
    if(platform && communityId) selected.forEach((x,i)=>historySaver.save.run(platform,communityId,x.id,historySaver.now+i));
    return selected.map(q => {

    // Remember the actual correct answer.
    const correctIndex = ['A', 'B', 'C', 'D'].indexOf(q.answer);
    const correctText = q.options[correctIndex];

    // Shuffle the four options.
    const options = [...q.options];

    for (let i = options.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [options[i], options[j]] = [options[j], options[i]];
    }

    // Find the correct answer's NEW position.
    const newCorrectIndex = options.indexOf(correctText);

    return {
        ...q,
        options,
        answer: ['A', 'B', 'C', 'D'][newCorrectIndex]
    };
});
}

module.exports = {
    selectQuestions
};