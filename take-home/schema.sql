-- Insert sample feedback data (table already exists)
INSERT INTO feedback (source, content, sentiment, urgency) VALUES
	('web', 'This product is amazing! I love how easy it is to use.', NULL, NULL),
	('web', 'The app crashed three times today. This is urgent and needs immediate attention!', NULL, NULL),
	('web', 'The interface is okay, nothing special but it works.', NULL, NULL),
	('web', 'I hate this service. It''s terrible and I want a refund ASAP!', NULL, NULL),
	('web', 'Great customer support, very helpful team.', NULL, NULL),
	('web', 'The loading time is too slow. Please fix this soon.', NULL, NULL),
	('web', 'Love the new features! Keep up the good work.', NULL, NULL),
	('web', 'Critical bug: users cannot log in. This needs to be fixed immediately!', NULL, NULL),
	('web', 'The design is nice but could use some improvements.', NULL, NULL),
	('web', 'Best product I''ve ever used. Highly recommend!', NULL, NULL);

